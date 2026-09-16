import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await dbClient.connect();
  console.log("Applying PIN hashing migration...\n");

  // Add pin_hash columns
  try {
    await dbClient.query("alter table public.scanner_pins add column if not exists pin_hash text");
    await dbClient.query("alter table public.box_office_pins add column if not exists pin_hash text");
    console.log("✅ pin_hash columns added");
  } catch (e) {
    console.error("⚠️ Column error:", e.message);
  }

  // Backfill pin_hash for existing rows
  try {
    const scannerBackfill = await dbClient.query(
      "update public.scanner_pins set pin_hash = encode(digest(event_id::text || ':' || pin_code, 'sha256'), 'hex') where pin_hash is null"
    );
    console.log(`✅ Backfilled ${scannerBackfill.rowCount} scanner PINs`);
    const boxOfficeBackfill = await dbClient.query(
      "update public.box_office_pins set pin_hash = encode(digest(event_id::text || ':' || pin_code, 'sha256'), 'hex') where pin_hash is null"
    );
    console.log(`✅ Backfilled ${boxOfficeBackfill.rowCount} box office PINs`);
  } catch (e) {
    console.error("⚠️ Backfill error:", e.message);
  }

  // Make pin_hash NOT NULL after backfill
  try {
    await dbClient.query(`
      do $$
      begin
        if not exists (select 1 from public.scanner_pins where pin_hash is null) then
          alter table public.scanner_pins alter column pin_hash set not null;
        end if;
        if not exists (select 1 from public.box_office_pins where pin_hash is null) then
          alter table public.box_office_pins alter column pin_hash set not null;
        end if;
      end;
      $$;
    `);
    console.log("✅ pin_hash set to NOT NULL");
  } catch (e) {
    console.error("⚠️ NOT NULL error:", e.message);
  }

  // Drop old unique constraints on (event_id, pin_code)
  try {
    await dbClient.query(`
      do $$
      begin
        if exists (select 1 from pg_constraint where conname = 'scanner_pins_event_id_pin_code_key') then
          alter table public.scanner_pins drop constraint scanner_pins_event_id_pin_code_key;
        end if;
        if exists (select 1 from pg_constraint where conname = 'box_office_pins_event_id_pin_code_key') then
          alter table public.box_office_pins drop constraint box_office_pins_event_id_pin_code_key;
        end if;
      end;
      $$;
    `);
    console.log("✅ Old unique constraints dropped");
  } catch (e) {
    console.error("⚠️ Constraint drop error:", e.message);
  }

  // Create new unique indexes on (event_id, pin_hash)
  try {
    await dbClient.query("create unique index if not exists scanner_pins_event_pin_hash_idx on public.scanner_pins(event_id, pin_hash)");
    await dbClient.query("create unique index if not exists box_office_pins_event_pin_hash_idx on public.box_office_pins(event_id, pin_hash)");
    console.log("✅ New unique indexes on pin_hash created");
  } catch (e) {
    console.error("⚠️ Index error:", e.message);
  }

  // Apply updated verify_scanner_pin RPC
  console.log("\nApplying updated PIN RPCs...");
  const rpcs = `
-- verify_scanner_pin
create or replace function public.verify_scanner_pin(p_event_id uuid, p_pin text)
returns table (
  event_id        uuid,
  event_title     text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text,
  organizer_name  text,
  valid_count     bigint,
  checked_in_count bigint,
  staff_name      text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin public.scanner_pins;
  v_hash text;
begin
  v_hash := encode(digest(p_event_id::text || ':' || p_pin, 'sha256'), 'hex');
  select * into v_pin from public.scanner_pins sp
   where sp.event_id = p_event_id and sp.pin_hash = v_hash and sp.is_active = true
   for update;
  if not found then
    return query select null::uuid, null::text, null::timestamptz, null::timestamptz, null::text, null::text, null::bigint, null::bigint, null::text;
    return;
  end if;
  update public.scanner_pins set last_used_at = now() where id = v_pin.id;
  return query
    select
      e.id, e.title, e.starts_at, e.ends_at, e.status::text,
      o.name,
      (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'VALID'),
      (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'USED'),
      v_pin.staff_name
    from public.events e
    join public.organizers o on o.id = e.organizer_id
    where e.id = p_event_id;
end;
$$;

-- generate_scanner_pins
create or replace function public.generate_scanner_pins(
  p_event_id    uuid,
  p_staff_names text[]
)
returns table (pin_code text, staff_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_id uuid;
  v_name text;
  v_pin text;
  v_hash text;
begin
  select organizer_id into v_organizer_id from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if not public.is_current_user_admin() and not exists (
    select 1 from public.organizers where id = v_organizer_id and owner_id = auth.uid()
  ) then
    raise exception 'Not authorised to manage scanner PINs for this event';
  end if;
  foreach v_name in array p_staff_names loop
    loop
      v_pin := lpad((floor(random() * 1000000))::text, 6, '0');
      v_hash := encode(digest(p_event_id::text || ':' || v_pin, 'sha256'), 'hex');
      exit when not exists (
        select 1 from public.scanner_pins sp where sp.event_id = p_event_id and sp.pin_hash = v_hash
      );
    end loop;
    insert into public.scanner_pins (event_id, organizer_id, pin_code, pin_hash, staff_name)
    values (p_event_id, v_organizer_id, v_pin, v_hash, v_name);
    return query select v_pin, v_name;
  end loop;
end;
$$;

-- verify_box_office_pin
create or replace function public.verify_box_office_pin(p_event_id uuid, p_pin text)
returns table (
  event_id        uuid,
  event_title     text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text,
  organizer_name  text,
  staff_name      text,
  role            text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin public.box_office_pins;
  v_hash text;
begin
  v_hash := encode(digest(p_event_id::text || ':' || p_pin, 'sha256'), 'hex');
  select * into v_pin from public.box_office_pins bp
   where bp.event_id = p_event_id and bp.pin_hash = v_hash and bp.is_active = true
   for update;
  if not found then
    return query select null::uuid, null::text, null::timestamptz, null::timestamptz, null::text, null::text, null::text, null::text;
    return;
  end if;
  update public.box_office_pins set last_used_at = now() where id = v_pin.id;
  return query
    select
      e.id, e.title, e.starts_at, e.ends_at, e.status::text,
      o.name,
      v_pin.staff_name,
      v_pin.role
    from public.events e
    left join public.organizers o on o.id = e.organizer_id
    where e.id = p_event_id;
end;
$$;

-- generate_box_office_pins
create or replace function public.generate_box_office_pins(
  p_event_id    uuid,
  p_staff_names text[],
  p_role        text default 'ORGANIZER'
)
returns table (pin_code text, staff_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_id uuid;
  v_name text;
  v_pin text;
  v_hash text;
begin
  select organizer_id into v_organizer_id from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if p_role = 'ADMIN' then
    if not public.is_current_user_admin() then
      raise exception 'Not authorised to create admin box office PINs';
    end if;
  else
    if not public.is_current_user_admin() and not exists (
      select 1 from public.organizers where id = v_organizer_id and owner_id = auth.uid()
    ) then
      raise exception 'Not authorised to manage box office PINs for this event';
    end if;
  end if;
  foreach v_name in array p_staff_names loop
    loop
      v_pin := lpad((floor(random() * 1000000))::text, 6, '0');
      v_hash := encode(digest(p_event_id::text || ':' || v_pin, 'sha256'), 'hex');
      exit when not exists (
        select 1 from public.box_office_pins bp where bp.event_id = p_event_id and bp.pin_hash = v_hash
      );
    end loop;
    insert into public.box_office_pins (event_id, organizer_id, pin_code, pin_hash, staff_name, role)
    values (p_event_id, v_organizer_id, v_pin, v_hash, v_name, p_role);
    return query select v_pin, v_name;
  end loop;
end;
$$;
  `;

  try {
    await dbClient.query(rpcs);
    console.log("✅ All 4 PIN RPCs updated to use pin_hash");
  } catch (e) {
    console.error("⚠️ RPC error:", e.message);
  }

  // Verify
  const scannerHash = await dbClient.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'scanner_pins' AND column_name = 'pin_hash' AND table_schema = 'public'");
  const boxHash = await dbClient.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'box_office_pins' AND column_name = 'pin_hash' AND table_schema = 'public'");
  const scannerIdx = await dbClient.query("SELECT indexname FROM pg_indexes WHERE tablename = 'scanner_pins' AND indexname = 'scanner_pins_event_pin_hash_idx'");
  const boxIdx = await dbClient.query("SELECT indexname FROM pg_indexes WHERE tablename = 'box_office_pins' AND indexname = 'box_office_pins_event_pin_hash_idx'");

  console.log("\nVerification:");
  console.log("scanner_pins.pin_hash:", scannerHash.rows.length > 0 ? "exists" : "missing");
  console.log("box_office_pins.pin_hash:", boxHash.rows.length > 0 ? "exists" : "missing");
  console.log("scanner_pins hash index:", scannerIdx.rows.length > 0 ? "exists" : "missing");
  console.log("box_office_pins hash index:", boxIdx.rows.length > 0 ? "exists" : "missing");

  await dbClient.end();
})().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
