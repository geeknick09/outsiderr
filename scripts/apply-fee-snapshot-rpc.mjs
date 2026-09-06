/**
 * Apply the updated create_paid_order RPC with fee snapshot parameters.
 */
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

const RPC_SQL = `
create or replace function public.create_paid_order(
  p_event_id        uuid,
  p_tier_id         uuid,
  p_quantity        integer,
  p_unit_price_paise   integer,
  p_subtotal_paise     integer,
  p_platform_fee_paise integer,
  p_total_paise        integer,
  p_fee_payer          text,
  p_utr_reference      text,
  p_payment_proof_url  text,
  p_buyer_name         text default null,
  p_buyer_phone        text default null,
  p_buyer_email        text default null,
  p_buyer_gender       text default null,
  p_commission_paise      integer default 0,
  p_convenience_fee_paise integer default 0,
  p_organizer_payout_paise integer default 0
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders;
  v_tier    public.ticket_tiers;
  v_event   public.events;
  v_existing_count integer;
begin
  -- Lock the tier row to prevent concurrent overbooking
  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.price_paise = 0 then
    raise exception 'This function is for paid tickets only';
  end if;
  if v_tier.quantity - v_tier.quantity_sold < p_quantity then
    raise exception 'Not enough tickets left in this tier';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  -- Prevent double booking: check for existing active orders by this user for this event
  select count(*) into v_existing_count
  from public.orders
  where event_id = p_event_id
    and user_id = auth.uid()
    and status in ('CONFIRMED', 'PENDING_VERIFICATION');
  if v_existing_count > 0 then
    raise exception 'You have already booked a ticket for this event';
  end if;

  -- Insert order as PENDING_VERIFICATION
  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, utr_reference, payment_proof_url,
    buyer_name, buyer_phone, buyer_email, buyer_gender,
    commission_paise, convenience_fee_paise, organizer_payout_paise
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    p_unit_price_paise, p_subtotal_paise, p_platform_fee_paise, p_total_paise,
    p_fee_payer::fee_payer, 'PENDING_VERIFICATION', p_utr_reference, p_payment_proof_url,
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
    p_commission_paise, p_convenience_fee_paise, p_organizer_payout_paise
  )
  returning * into v_order;

  -- Do NOT increment quantity_sold here — only on approval
  -- Do NOT mint tickets here — only on approval

  return v_order;
end;
$$;
`;

async function main() {
  await dbClient.connect();
  console.log("Applying updated create_paid_order RPC...");
  await dbClient.query(RPC_SQL);
  console.log("✅ RPC updated successfully");
  await dbClient.end();
}
main().catch((e) => { console.error("❌ Failed:", e.message); process.exit(1); });
