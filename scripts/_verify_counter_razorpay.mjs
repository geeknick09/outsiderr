// Rolled-back live checks for create_counter_reserved_order + the capture path.
import { Client } from "pg";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

const env = readFileSync(".env", "utf8");
const pw = env.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]?.trim();
const url = env.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim()
  || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(pw)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const ok = (n, b) => { if (!b) throw new Error(`FAIL ${n}`); console.log(`ok ${n}`); };
let passed = 0, failed = 0, savepoint = 0;
// Each check runs inside a savepoint: an intentional raised error would
// otherwise abort the whole transaction and cascade into later checks.
const check = async (n, fn) => {
  const sp = `sp_${++savepoint}`;
  await c.query(`savepoint ${sp}`);
  try { await fn(); passed++; await c.query(`release savepoint ${sp}`); }
  catch (e) { failed++; await c.query(`rollback to savepoint ${sp}`); console.log(`FAIL ${n}: ${e.message}`); }
};

await c.connect();
await c.query("begin");
try {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  const [ev] = await q(`select e.id, e.organizer_id, t.id as tier_id, t.price_paise
    from public.events e join public.ticket_tiers t on t.event_id = e.id
    where e.status::text in ('PUBLISHED','POSTPONED') and t.price_paise > 0
      and t.quantity - t.quantity_sold - coalesce(t.quantity_reserved,0) >= 5
    order by e.created_at desc limit 1`);
  if (!ev) throw new Error("no live paid event with seats");
  const [staff] = await q(`select * from public.staff_register('ADMIN', null, 'Rzp Counter Test', null, $1, null)`,
    ["9" + String(Date.now()).slice(-9)]);
  await q(`select public.staff_set_assignment($1,$2,true)`, [staff.staff_id, ev.id]);
  const [other] = await q(`select * from public.staff_register('ADMIN', null, 'Unassigned', null, $1, null)`,
    ["8" + String(Date.now()).slice(-9)]);
  const key = randomUUID();

  await check("reserve: creates RESERVED order + intent with NULL user", async () => {
    const [o] = await q(`select * from public.create_counter_reserved_order($1,$2,$3,'Test Buyer','9000000001',null,null,$4)`,
      [staff.staff_id, ev.id, ev.tier_id, key]);
    ok("order returned", o.id);
    ok("status RESERVED", o.status === "RESERVED");
    ok("user null", o.user_id === null);
    ok("sale_channel", o.sale_channel === "COUNTER_RAZORPAY");
    ok("attribution", o.sold_by_staff_id === staff.staff_id && o.is_box_office === true);
    ok("source BOX_OFFICE", o.order_source === "BOX_OFFICE");
    const gw = Math.round((ev.price_paise + Math.round(ev.price_paise * 200 / 10000)) * 236 / (10000 - 236));
    const expTotal = ev.price_paise + Math.round(ev.price_paise * 200 / 10000) + gw;
    ok(`total ${o.total_paise} = ${expTotal}`, o.total_paise === expTotal);
    const [i] = await q(`select * from public.payment_intents where ref_id=$1 and kind='TICKET_ORDER'`, [o.id]);
    ok("intent exists", i.id && i.user_id === null && i.amount_paise === o.total_paise && i.status === "CREATED");
    global.__order = o; global.__intent = i;
  });

  await check("replay: same key returns the same order", async () => {
    const [o2] = await q(`select * from public.create_counter_reserved_order($1,$2,$3,'Test Buyer','9000000001',null,null,$4)`,
      [staff.staff_id, ev.id, ev.tier_id, key]);
    ok("same order id", o2.id === global.__order.id);
  });

  await check("unassigned staff is refused", async () => {
    await c.query("savepoint refuse");
    let err = null;
    try {
      await q(`select * from public.create_counter_reserved_order($1,$2,$3,'X','9000000002',null,null,$4)`,
        [other.staff_id, ev.id, ev.tier_id, randomUUID()]);
    } catch (e) { err = e; }
    await c.query("rollback to savepoint refuse");
    ok("raised", err !== null && /not assigned/.test(err.message));
  });

  await check("attach + capture confirms order, mints ticket, writes ledger", async () => {
    await q(`select public.attach_razorpay_order($1,$2)`, [global.__intent.id, "order_TESTctr1"]);
    const [res] = await q(`select public.apply_captured_payment('order_TESTctr1','pay_TESTctr1',$1,'INR','card',250,45,'sig')`,
      [global.__intent.amount_paise]);
    ok("APPLIED/confirmed outcome", res.apply_captured_payment.startsWith("APPLIED") || res.apply_captured_payment === "ALREADY_PAID");
    const [o] = await q(`select status, payment_method from public.orders where id=$1`, [global.__order.id]);
    ok("CONFIRMED", o.status === "CONFIRMED" && o.payment_method === "card");
    const [t] = await q(`select id, status, user_id from public.tickets where order_id=$1`, [global.__order.id]);
    ok("ticket minted", t.id && t.status === "VALID" && t.user_id === null);
    const [l] = await q(`select razorpay_fee_paise, net_platform_paise, gross_amount_paise from public.payment_ledger where order_id=$1`, [global.__order.id]);
    ok("ledger row", l.gross_amount_paise === ev.price_paise);
    ok("gateway fee recorded (250)", l.razorpay_fee_paise === 250);
  });

  await check("second capture of the same payment is a no-op", async () => {
    const [res] = await q(`select public.apply_captured_payment('order_TESTctr1','pay_TESTctr1',$1,'INR','card',250,45,'sig')`,
      [global.__intent.amount_paise]);
    ok("ALREADY_PAID", res.apply_captured_payment === "ALREADY_PAID");
    const [n] = await q(`select count(*)::int n from public.payment_ledger where order_id=$1`, [global.__order.id]);
    ok("still one ledger row", n.n === 1);
  });

  await check("abandon releases the reservation", async () => {
    const [o3] = await q(`select * from public.create_counter_reserved_order($1,$2,$3,'Y','9000000003',null,null,$4)`,
      [staff.staff_id, ev.id, ev.tier_id, randomUUID()]);
    const [i3] = await q(`select * from public.payment_intents where ref_id=$1`, [o3.id]);
    await q(`select public.attach_razorpay_order($1,$2)`, [i3.id, "order_TESTctr2"]);
    const [res] = await q(`select public.abandon_payment('order_TESTctr2')`, []);
    ok("ABANDONED", res.abandon_payment.startsWith("ABANDONED"));
    const [o] = await q(`select status from public.orders where id=$1`, [o3.id]);
    ok("order FAILED", o.status === "FAILED");
    const [tier] = await q(`select quantity_reserved from public.ticket_tiers where id=$1`, [ev.tier_id]);
    const [sum] = await q(`select coalesce(sum(quantity),0)::int n from public.orders where tier_id=$1 and status='RESERVED'`, [ev.tier_id]);
    ok("reserved count released", tier.quantity_reserved === sum.n);
  });
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(`\n${passed} passed, ${failed} failed (rolled back)`);
process.exit(failed ? 1 : 0);
