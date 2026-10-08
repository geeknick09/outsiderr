// Verifies create_walkin_order (Phase 0) against the live DB.
// Everything runs inside one transaction that is always rolled back, so no rows persist.
// Usage: node scripts/_verify_walkin_phase0.mjs
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
const dbUrl = envContent.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
const connectionString = dbUrl || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: [ev] } = await client.query(`
  select e.id, e.commission_enabled, e.commission_bps, e.convenience_fee_enabled,
         e.convenience_fee_bps, e.fee_payer::text as fee_payer,
         t.id as tier_id, t.price_paise, t.quantity, t.quantity_sold,
         coalesce(t.quantity_reserved, 0) as quantity_reserved
    from public.events e
    join public.ticket_tiers t on t.event_id = e.id
   where e.status::text in ('PUBLISHED', 'POSTPONED')
     and t.price_paise > 0
     and t.quantity - t.quantity_sold - coalesce(t.quantity_reserved, 0) >= 3
   limit 1`);

if (!ev) {
  console.log("SKIP  no live published event with >= 3 seats and a paid tier; nothing verified");
  await client.end();
  process.exit(0);
}

const { rows: [{ gw }] } = await client.query(`select public._setting_int('gateway_fee_bps', 236) as gw`);

await client.query("begin");
try {
  const key = randomUUID();
  const callSql = `select public.create_walkin_order($1, 'Phase0 Verify', '9000000000', $2, null, 0, 'WALKIN_PREEVENT', $3) as j`;

  const first = (await client.query(callSql, [ev.id, ev.tier_id, key])).rows[0].j;
  const again = (await client.query(callSql, [ev.id, ev.tier_id, key])).rows[0].j;
  check("same client key returns the original sale (no double ticket)", first.orderId === again.orderId);

  const sub = Number(ev.price_paise);
  const comm = ev.commission_enabled ? Math.round((sub * Number(ev.commission_bps)) / 10000) : 0;
  const conv = ev.convenience_fee_enabled ? Math.round((sub * Number(ev.convenience_fee_bps)) / 10000) : 0;
  const gwv = Math.round(((sub + conv) * Number(gw)) / (10000 - Number(gw)));
  const expTotal = ev.fee_payer === "ORGANIZER" ? sub : sub + conv + gwv;
  const expPayout = ev.fee_payer === "ORGANIZER" ? sub - comm - conv - gwv : sub - comm;

  check("buyer total matches online pricing", first.totalPaise === expTotal, `got ${first.totalPaise}, expected ${expTotal}`);
  check("organizer payout matches online pricing", first.payoutPaise === expPayout, `got ${first.payoutPaise}, expected ${expPayout}`);

  const { rows: ledger } = await client.query(
    `select type, gross_amount_paise, commission_paise, convenience_fee_paise, razorpay_fee_paise,
            net_organizer_paise, net_platform_paise
       from public.payment_ledger where order_id = $1`,
    [first.orderId],
  );
  check("exactly one ledger row for the counter sale", ledger.length === 1, `rows=${ledger.length}`);
  const L = ledger[0] ?? {};
  check("ledger is a TICKET_SALE with zero gateway (razorpay) fee", L.type === "TICKET_SALE" && Number(L.razorpay_fee_paise) === 0);
  check(
    "ledger net_organizer equals organizer payout",
    Number(L.net_organizer_paise) === expPayout,
    `got ${L.net_organizer_paise}, expected ${expPayout}`,
  );
  check(
    "ledger net_organizer + net_platform equals buyer total",
    Number(L.net_organizer_paise) + Number(L.net_platform_paise) === expTotal,
  );

  // Sell out the tier inside this transaction, then expect a clean refusal.
  await client.query(
    `update public.ticket_tiers set quantity = quantity_sold + coalesce(quantity_reserved, 0) where id = $1`,
    [ev.tier_id],
  );
  await client.query("savepoint sold_out");
  try {
    await client.query(callSql, [ev.id, ev.tier_id, randomUUID()]);
    check("sold-out tier refuses a new counter sale", false, "sale was accepted");
  } catch (err) {
    check("sold-out tier refuses a new counter sale", /Sold out/.test(err.message), err.message);
    await client.query("rollback to savepoint sold_out");
  }

  // Tier is required: no tier, no sale.
  await client.query("savepoint no_tier");
  try {
    await client.query(`select public.create_walkin_order($1, 'X', '9000000000', null, null, 500, 'WALKIN_PREEVENT', $2)`, [ev.id, randomUUID()]);
    check("sale without a tier is refused (client amount ignored)", false, "sale was accepted");
  } catch (err) {
    check("sale without a tier is refused (client amount ignored)", /Select a ticket tier/.test(err.message), err.message);
    await client.query("rollback to savepoint no_tier");
  }
} catch (err) {
  check("verification ran to completion", false, err.message);
} finally {
  await client.query("rollback");
  await client.end();
}

console.log(failures === 0 ? "\nAll walk-in checks passed (transaction rolled back)." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
