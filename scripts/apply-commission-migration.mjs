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
  console.log("Applying commission + convenience fee migration...");

  // Event columns
  await dbClient.query(`alter table public.events add column if not exists commission_bps integer not null default 1000`);
  await dbClient.query(`alter table public.events add column if not exists commission_enabled boolean not null default true`);
  await dbClient.query(`alter table public.events add column if not exists convenience_fee_bps integer not null default 200`);
  await dbClient.query(`alter table public.events add column if not exists convenience_fee_enabled boolean not null default true`);
  console.log("  ✓ events columns added");

  // Order columns
  await dbClient.query(`alter table public.orders add column if not exists commission_paise integer not null default 0`);
  await dbClient.query(`alter table public.orders add column if not exists convenience_fee_paise integer not null default 0`);
  await dbClient.query(`alter table public.orders add column if not exists organizer_payout_paise integer not null default 0`);
  console.log("  ✓ orders columns added");

  // Audit log table
  await dbClient.query(`
    create table if not exists public.admin_change_log (
      id          uuid        primary key default gen_random_uuid(),
      admin_id    uuid        not null references auth.users(id),
      table_name  text        not null,
      entity_id   text,
      field_name  text        not null,
      old_value   text,
      new_value   text,
      reason      text,
      created_at  timestamptz not null default now()
    )
  `);
  await dbClient.query(`create index if not exists admin_change_log_created_idx on public.admin_change_log(created_at desc)`);
  await dbClient.query(`create index if not exists admin_change_log_entity_idx on public.admin_change_log(table_name, entity_id)`);
  console.log("  ✓ admin_change_log table created");

  // RLS
  await dbClient.query(`alter table public.admin_change_log enable row level security`);
  await dbClient.query(`drop policy if exists "admins read change log" on public.admin_change_log`);
  await dbClient.query(`create policy "admins read change log" on public.admin_change_log for select to authenticated using (public.is_current_user_admin())`);
  await dbClient.query(`drop policy if exists "admins insert change log" on public.admin_change_log`);
  await dbClient.query(`create policy "admins insert change log" on public.admin_change_log for insert to authenticated with check (public.is_current_user_admin())`);
  console.log("  ✓ RLS policies added");

  // Platform settings
  await dbClient.query(`insert into public.platform_settings (key, value, description) values ('default_commission_bps', '1000', 'Default organizer commission in basis points (10%)') on conflict (key) do nothing`);
  await dbClient.query(`insert into public.platform_settings (key, value, description) values ('default_convenience_fee_bps', '200', 'Default buyer convenience fee in basis points (2%)') on conflict (key) do nothing`);
  console.log("  ✓ platform settings added");

  // Verify
  const { rows: eventCols } = await dbClient.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'events' AND column_name IN ('commission_bps','commission_enabled','convenience_fee_bps','convenience_fee_enabled')`);
  console.log("  events new columns:", eventCols.map(r => r.column_name));
  const { rows: orderCols } = await dbClient.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('commission_paise','convenience_fee_paise','organizer_payout_paise')`);
  console.log("  orders new columns:", orderCols.map(r => r.column_name));

  console.log("Done!");
  await dbClient.end();
})();
