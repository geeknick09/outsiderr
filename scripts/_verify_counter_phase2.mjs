// Verifies Phase 2 counter-cash flow on the live DB, inside one rolled-back transaction.
// Usage: node scripts/_verify_counter_phase2.mjs
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
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows: [ev] } = await client.query(`
  select e.id, t.id as tier_id from public.events e
    join public.ticket_tiers t on t.event_id = e.id
   where e.status::text in ('PUBLISHED','POSTPONED') and t.price_paise > 0
     and t.quantity - t.quantity_sold - coalesce(t.quantity_reserved,0) >= 2
   limit 1`);
if (!ev) {
  console.log("SKIP  no live event with seats");
  await client.end();
  process.exit(0);
}

await client.query("begin");
try {
  const phone = "9" + String(Date.now()).slice(-9);
  const { rows: [reg] } = await client.query(
    `select * from public.staff_register('ADMIN', null, 'Counter Verify', null, $1, null)`, [phone]);

  const { rows: [login] } = await client.query(
    `select * from public.staff_login_session($1, $2)`, [phone, reg.pin]);
  check("login with the issued PIN returns a token", !!login?.token);

  const { rows: [bad] } = await client.query(
    `select * from public.staff_login_session($1, '000000')`, [phone]);
  check("login with a wrong PIN returns nothing", !bad, bad ? "returned a row" : "");

  const { rows: [who] } = await client.query(`select * from public.staff_session_staff($1)`, [login.token]);
  check("token resolves to the staff member", who?.staff_id === reg.staff_id);

  await client.query(`select public.staff_set_assignment($1, $2, true)`, [reg.staff_id, ev.id]);
  const key = randomUUID();
  const { rows: [sale] } = await client.query(
    `select public.create_counter_cash_sale($1,$2,$3,'Walk Up','9000000002',null,'WALKIN_PREEVENT',$4) as j`,
    [reg.staff_id, ev.id, ev.tier_id, key]);
  const orderId = sale.j.orderId;
  check("counter cash sale creates a ticket", !!sale.j.ticketId);

  const { rows: [o] } = await client.query(
    `select sold_by_staff_id, sale_channel, total_paise from public.orders where id = $1`, [orderId]);
  check("sale is attributed to the staff member and channel is COUNTER_CASH",
    o.sold_by_staff_id === reg.staff_id && o.sale_channel === "COUNTER_CASH");

  const { rows: [l] } = await client.query(`select notes from public.payment_ledger where order_id = $1`, [orderId]);
  check("ledger note says box office cash sale", l?.notes === "Box office cash sale", l?.notes);

  const { rows: [out] } = await client.query(
    `select * from public.staff_cash_outstanding($1,$2)`, [reg.staff_id, ev.id]);
  check("cash outstanding equals the sale total", Number(out.amount_paise) === Number(o.total_paise),
    `${out.amount_paise} vs ${o.total_paise}`);

  const { rows: [h] } = await client.query(
    `select public.confirm_cash_handover($1,$2,null) as amount`, [reg.staff_id, ev.id]);
  check("handover confirms the full outstanding amount", Number(h.amount) === Number(o.total_paise));

  await client.query("savepoint sp_again");
  try {
    await client.query(`select public.confirm_cash_handover($1,$2,null)`, [reg.staff_id, ev.id]);
    check("second handover for the same cash is refused", false, "accepted");
  } catch (err) {
    check("second handover for the same cash is refused", /No cash is outstanding/.test(err.message), err.message);
    await client.query("rollback to savepoint sp_again");
  }

  // Unassigned staff cannot sell at this event.
  const phone2 = "8" + String(Date.now()).slice(-9);
  const { rows: [reg2] } = await client.query(
    `select * from public.staff_register('ADMIN', null, 'Unassigned', null, $1, null)`, [phone2]);
  await client.query("savepoint sp_unassigned");
  try {
    await client.query(`select public.create_counter_cash_sale($1,$2,$3,'X','9000000003',null,'WALKIN_PREEVENT',$4)`,
      [reg2.staff_id, ev.id, ev.tier_id, randomUUID()]);
    check("unassigned staff cannot sell", false, "sale accepted");
  } catch (err) {
    check("unassigned staff cannot sell", /not assigned/.test(err.message), err.message);
    await client.query("rollback to savepoint sp_unassigned");
  }
} catch (err) {
  check("verification ran to completion", false, err.message);
} finally {
  await client.query("rollback");
  await client.end();
}
console.log(failures === 0 ? "\nAll Phase 2 checks passed (rolled back)." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
