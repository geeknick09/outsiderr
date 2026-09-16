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
  console.log("Applying idempotency migration...\n");

  // Add idempotency_key column
  try {
    await dbClient.query("alter table public.orders add column if not exists idempotency_key text");
    console.log("✅ idempotency_key column added");
  } catch (e) {
    console.error("⚠️ Column error:", e.message);
  }

  // Add unique index
  try {
    await dbClient.query("create unique index if not exists orders_idempotency_idx on public.orders(idempotency_key) where idempotency_key is not null");
    console.log("✅ idempotency unique index created");
  } catch (e) {
    console.error("⚠️ Index error:", e.message);
  }

  // Apply the updated create_walkin_order RPC
  console.log("\nApplying updated create_walkin_order RPC...");
  const rpcSql = `
create or replace function public.create_walkin_order(
  p_event_id    uuid,
  p_buyer_name  text,
  p_buyer_phone text,
  p_tier_id     uuid    default null,
  p_buyer_email text    default null,
  p_amount_paise integer default 0,
  p_mode        text    default 'WALKIN_PREEVENT',
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event         public.events;
  v_tier          public.ticket_tiers;
  v_subtotal      integer;
  v_commission    integer;
  v_payout        integer;
  v_order_id      uuid;
  v_ticket_id     uuid;
  v_tier_id       uuid;
  v_ticket_status text;
  v_existing      public.orders;
begin
  -- Idempotency: if an order with this key already exists, return it
  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where idempotency_key = p_idempotency_key limit 1;
    if v_existing.id is not null then
      select id into v_ticket_id from public.tickets where order_id = v_existing.id limit 1;
      return jsonb_build_object(
        'orderId', v_existing.id,
        'ticketId', v_ticket_id,
        'subtotalPaise', v_existing.subtotal_paise,
        'commissionPaise', v_existing.commission_paise,
        'payoutPaise', v_existing.organizer_payout_paise,
        'ticketStatus', case when v_existing.order_source = 'WALKIN_INSTANT' then 'USED' else 'VALID' end
      );
    end if;
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;

  if p_tier_id is not null then
    select * into v_tier from public.ticket_tiers where id = p_tier_id and event_id = p_event_id;
    if not found then raise exception 'Tier not found'; end if;
    v_subtotal := v_tier.price_paise;
    v_tier_id  := p_tier_id;
  else
    v_subtotal := p_amount_paise;
    select id into v_tier_id from public.ticket_tiers where event_id = p_event_id limit 1;
    if v_tier_id is null then raise exception 'No tiers exist for this event'; end if;
  end if;

  v_commission := case when v_event.commission_enabled
    then round(v_subtotal * v_event.commission_bps / 10000.0)
    else 0 end;
  v_payout := v_subtotal - v_commission;

  v_ticket_status := case when p_mode = 'WALKIN_INSTANT' then 'USED' else 'VALID' end;

  insert into public.orders (
    event_id, tier_id, user_id, quantity, unit_price_paise,
    subtotal_paise, platform_fee_paise, commission_paise,
    convenience_fee_paise, organizer_payout_paise, total_paise,
    fee_payer, status, confirmed_at, buyer_name, buyer_phone, buyer_email,
    order_source, is_box_office, idempotency_key
  ) values (
    p_event_id, v_tier_id, null, 1, v_subtotal,
    v_subtotal, v_commission, v_commission,
    0, v_payout, v_subtotal,
    v_event.fee_payer, 'CONFIRMED', now(), p_buyer_name, p_buyer_phone, p_buyer_email,
    p_mode, true, p_idempotency_key
  ) returning id into v_order_id;

  insert into public.tickets (
    order_id, event_id, tier_id, user_id, status, qr_hash,
    checked_in_at
  ) values (
    v_order_id, p_event_id, v_tier_id, null, v_ticket_status::ticket_status, gen_random_uuid()::text,
    case when p_mode = 'WALKIN_INSTANT' then now() else null end
  ) returning id into v_ticket_id;

  update public.ticket_tiers set quantity_sold = quantity_sold + 1
    where id = v_tier_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'ticketId', v_ticket_id,
    'subtotalPaise', v_subtotal,
    'commissionPaise', v_commission,
    'payoutPaise', v_payout,
    'ticketStatus', v_ticket_status
  );
end;
$$;
  `;

  try {
    await dbClient.query(rpcSql);
    console.log("✅ create_walkin_order RPC updated with idempotency");
  } catch (e) {
    console.error("⚠️ RPC error:", e.message);
  }

  // Verify
  const col = await dbClient.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'idempotency_key' AND table_schema = 'public'");
  console.log("\nVerification:");
  console.log("idempotency_key column:", col.rows.length > 0 ? "exists" : "missing");

  const idx = await dbClient.query("SELECT indexname FROM pg_indexes WHERE tablename = 'orders' AND indexname = 'orders_idempotency_idx'");
  console.log("idempotency index:", idx.rows.length > 0 ? "exists" : "missing");

  await dbClient.end();
})().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
