// One-off backfill: writes the missing TICKET_SALE ledger row for box-office orders
// created before the Phase 0 fix. Uses the amounts already stored on each order, so
// the ledger matches what the buyer paid. Idempotent (skips orders that have a row).
// Usage: node scripts/_backfill_walkin_ledger.mjs [--apply]
// Without --apply it runs in a transaction and rolls back (dry run).
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
const dbUrl = envContent.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
const connectionString = dbUrl || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
const apply = process.argv.includes("--apply");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("begin");
try {
  const { rows: gaps } = await client.query(`
    select o.id, o.event_id, e.organizer_id, o.subtotal_paise, o.commission_paise,
           coalesce(o.convenience_fee_paise, 0) as convenience_fee_paise,
           coalesce(o.gateway_fee_paise, 0) as gateway_fee_paise,
           coalesce(o.platform_fee_paise, 0) as platform_fee_paise,
           o.organizer_payout_paise, o.total_paise
      from public.orders o
      join public.events e on e.id = o.event_id
     where o.is_box_office = true
       and o.subtotal_paise > 0
       and not exists (select 1 from public.payment_ledger l where l.order_id = o.id)
     order by o.created_at`);

  let mismatches = 0;
  for (const o of gaps) {
    const sumOk = Number(o.organizer_payout_paise) + Number(o.platform_fee_paise) + Number(o.gateway_fee_paise) === Number(o.total_paise);
    if (!sumOk) mismatches++;
  }
  console.log(`box-office orders without a ledger row: ${gaps.length} (amount mismatches: ${mismatches})`);
  if (mismatches > 0) throw new Error("stored amounts do not reconcile; not writing anything");

  const { rowCount } = await client.query(`
    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, convenience_fee_paise, razorpay_fee_paise,
      net_organizer_paise, net_platform_paise, razorpay_payment_id, notes)
    select o.id, o.event_id, e.organizer_id, 'TICKET_SALE', o.subtotal_paise,
           o.commission_paise,
           coalesce(o.convenience_fee_paise, 0) + coalesce(o.gateway_fee_paise, 0), 0,
           o.organizer_payout_paise,
           coalesce(o.platform_fee_paise, 0) + coalesce(o.gateway_fee_paise, 0),
           null, 'Box office sale (backfill)'
      from public.orders o
      join public.events e on e.id = o.event_id
     where o.is_box_office = true
       and o.subtotal_paise > 0
       and not exists (select 1 from public.payment_ledger l where l.order_id = o.id)`);
  console.log(`rows written: ${rowCount}`);

  const { rows: [left] } = await client.query(`
    select count(*)::int as n from public.orders o
     where o.is_box_office = true and o.subtotal_paise > 0
       and not exists (select 1 from public.payment_ledger l where l.order_id = o.id)`);
  console.log(`orders still without a ledger row: ${left.n}`);
  if (left.n !== 0) throw new Error("backfill incomplete");

  if (apply) {
    await client.query("commit");
    console.log("COMMITTED");
  } else {
    await client.query("rollback");
    console.log("DRY RUN - rolled back. Re-run with --apply to commit.");
  }
} catch (err) {
  await client.query("rollback");
  console.error("ROLLED BACK:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
