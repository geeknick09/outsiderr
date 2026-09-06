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
  console.log("Connected to DB");

  // Update check_in_ticket RPC to match schema.sql (with p_event_id parameter)
  const rpcSQL = `
create or replace function public.check_in_ticket(p_qr_hash text, p_event_id uuid)
returns table (
  outcome       text,
  event_title   text,
  tier_name     text,
  holder_name   text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
begin
  select * into v_ticket
    from public.tickets
   where qr_hash = p_qr_hash
     for update;

  if not found then
    return query
      select 'INVALID'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Validate ticket belongs to the selected event
  if v_ticket.event_id <> p_event_id then
    return query
      select 'INVALID'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if not public.is_event_staff(v_ticket.event_id) then
    raise exception 'Not authorised to scan tickets for this event';
  end if;

  if v_ticket.status <> 'VALID' then
    return query
      select
        case when v_ticket.status = 'USED' then 'ALREADY_USED' else 'INVALID' end,
        e.title,
        t.name,
        p.full_name,
        v_ticket.checked_in_at
      from public.events       e
      join public.ticket_tiers t on t.id = v_ticket.tier_id
      left join public.profiles p on p.id = v_ticket.user_id
      where e.id = v_ticket.event_id;
    return;
  end if;

  update public.tickets
     set status        = 'USED',
         checked_in_at = now(),
         checked_in_by = auth.uid()
   where id = v_ticket.id
   returning * into v_ticket;

  return query
    select
      'VALID'::text,
      e.title,
      t.name,
      p.full_name,
      v_ticket.checked_in_at
    from public.events       e
    join public.ticket_tiers t on t.id = v_ticket.tier_id
    left join public.profiles p on p.id = v_ticket.user_id
    where e.id = v_ticket.event_id;
end;
$$;
`;

  await dbClient.query(rpcSQL);
  console.log("✅ check_in_ticket RPC updated with p_event_id parameter");

  // Also fix the throw error in checkInTicket to use Error
  // (code fix already done in orders.ts)

  await dbClient.end();
})();
