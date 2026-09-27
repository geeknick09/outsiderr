// STEP 35 live probe — refund pipeline end-to-end + cancel_event v2.
// Run: node scripts/_test_step35.mjs
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

if (!globalThis.WebSocket) globalThis.WebSocket = class {};
config({ path: ".env" });

const conn = `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label} ${extra}`); };
const log = (m) => console.log("  — " + m);

const seed = { events: [], tiers: [], orders: [], intents: [], refunds: [], tickets: [], ledger: [], notifs: false };

async function confirmedOrder(uid, price = 10000) {
  const { data: org } = await s.from("organizers").select("id").eq("kyc_status", "APPROVED").limit(1).single();
  const eid = crypto.randomUUID(), tid = crypto.randomUUID();
  await s.from("events").insert({
    id: eid, organizer_id: org.id, title: "REF-TEST", description: "x", venue_name: "T", venue_address: "x",
    starts_at: new Date(Date.now() + 7 * 864e5).toISOString(), status: "PUBLISHED",
    category: "OTHER", categories: ["OTHER"], city: "KOLKATA", pricing_mode: "PAID", created_at: new Date().toISOString(),
  });
  await s.from("ticket_tiers").insert({ id: tid, event_id: eid, name: "GA", price_paise: price, quantity: 10 });
  seed.events.push(eid); seed.tiers.push(tid);

  const { data: ord } = await anon.rpc("create_reserved_order", { p_event_id: eid, p_tier_id: tid, p_quantity: 1 });
  const { data: intent } = await s.from("payment_intents").select("id").eq("ref_id", ord.id).single();
  const rzpOid = "order_ref_" + crypto.randomUUID().slice(0, 8);
  await s.rpc("attach_razorpay_order", { p_intent_id: intent.id, p_razorpay_order_id: rzpOid });
  const rzpPid = "pay_ref_" + crypto.randomUUID().slice(0, 8);
  await c.query("select public.apply_captured_payment($1,$2,$3,$4)", [rzpOid, rzpPid, ord.total_paise, "INR"]);
  seed.orders.push(ord.id); seed.intents.push(ord.id);
  const { data: after } = await s.from("orders").select("status").eq("id", ord.id).single();
  if (after.status !== "CONFIRMED") throw new Error("order not confirmed: " + after.status);
  return { ord, eid, tid };
}

try {
  await c.connect();
  const { data: auth } = await s.auth.admin.listUsers();
  const dev = auth.users.find((u) => u.email === "dev.user@outsiderr.test");
  const admin = auth.users.find((u) => u.email === "dev.admin@outsiderr.test");
  await anon.auth.signInWithPassword({ email: dev.email, password: "DevTest#1234" });
  const adminC = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: ae } = await adminC.auth.signInWithPassword({ email: admin.email, password: "DevTest#1234" });
  log("signed in (admin: " + (ae ? "FAIL " + ae.message : "ok") + ")");

  // ===== happy path: request → approve → claim → initiate → finalize =====
  const { ord, eid } = await confirmedOrder(dev.id);
  // organizer requests (organizer owner is a different user — use admin to keep it simple? request_refund allows event staff; seed org owner. Try buyer → expect denial)
  let rr = await anon.rpc("request_refund", { p_order_id: ord.id, p_reason: "buyer changed plans" });
  ok("buyer request_refund denied (not staff)", !!rr.error, rr.error?.message?.slice(0, 50));
  // admin requests
  rr = await adminC.rpc("request_refund", { p_order_id: ord.id, p_reason: "exceptional case — duplicate purchase" });
  ok("admin request_refund → REQUESTED", !rr.error && rr.data?.status === "REQUESTED", rr.error?.message);
  const refundId = rr.data.id;
  const { data: admAlerts } = await s.from("event_notifications").select("type").eq("type", "REFUND_REQUESTED").limit(1);
  ok("REFUND_REQUESTED → admin notified", admAlerts.length > 0);
  seed.notifs = true;

  // reject path on a second request — need another order
  const { ord: ord2 } = await confirmedOrder(dev.id, 5000);
  const rr2 = await adminC.rpc("request_refund", { p_order_id: ord2.id, p_reason: "duplicate test reject" });
  const rej = await adminC.rpc("reject_refund", { p_refund_id: rr2.data.id, p_reason: "not valid" });
  const { data: ord2s } = await s.from("orders").select("status").eq("id", ord2.id).single();
  ok("reject_refund → REJECTED, order stays CONFIRMED", !rej.error && rej.data?.status === "REJECTED" && ord2s.status === "CONFIRMED", rej.error?.message);

  // approve
  const ap = await adminC.rpc("approve_refund", { p_refund_id: refundId, p_scope: "TICKET_PRICE", p_note: "ok" });
  ok("approve_refund → PENDING amount=subtotal", !ap.error && ap.data?.status === "PENDING" && ap.data?.amount_paise === ord.subtotal_paise, ap.error?.message + " amt=" + ap.data?.amount_paise);
  const { data: ordA } = await s.from("orders").select("status").eq("id", ord.id).single();
  const { data: tixA } = await s.from("tickets").select("status").eq("order_id", ord.id);
  ok("order REFUND_REQUESTED + tickets CANCELLED", ordA.status === "REFUND_REQUESTED" && tixA.every((t) => t.status === "CANCELLED"), ordA.status);

  // claim — two concurrent grabs race; only one row should be claimed
  const [c1, c2] = await Promise.all([
    s.rpc("claim_pending_refunds", { p_limit: 20 }),
    s.rpc("claim_pending_refunds", { p_limit: 20 }),
  ]);
  const claimed = [...(c1.data ?? []), ...(c2.data ?? [])].filter((r) => r.id === refundId);
  ok("claim_pending_refunds → exactly one claim", claimed.length === 1, `c1=${(c1.data ?? []).length} c2=${(c2.data ?? []).length}`);

  // initiate
  const rzpRid = "rfnd_" + Date.now();
  await s.rpc("complete_refund_initiation", { p_refund_id: refundId, p_razorpay_refund_id: rzpRid, p_ok: true });
  const { data: rA } = await s.from("refunds").select("status, razorpay_refund_id").eq("id", refundId).single();
  const { data: led } = await s.from("payment_ledger").select("type, gross_amount_paise").eq("razorpay_payment_id", "refund_" + rzpRid).maybeSingle();
  ok("initiation → INITIATED + REFUND ledger", rA.status === "INITIATED" && led?.type === "REFUND" && led?.gross_amount_paise === -ord.subtotal_paise, rA.status);

  // finalize
  const fin = await s.rpc("finalize_refund", { p_razorpay_refund_id: rzpRid, p_status: "processed" });
  const { data: ordF } = await s.from("orders").select("status").eq("id", ord.id).single();
  const { data: rF } = await s.from("refunds").select("status").eq("id", refundId).single();
  ok("finalize → refund COMPLETED + order REFUNDED", fin.data === "COMPLETED" && rF.status === "COMPLETED" && ordF.status === "REFUNDED", `${fin.data}/${rF.status}/${ordF.status}`);

  // over-refund guard — the completed refund took the subtotal; a second
  // refund over the remaining fee portion must be rejected.
  const { error: ovErr } = await s.from("refunds").insert({
    order_id: ord.id, event_id: ord.event_id, user_id: dev.id,
    amount_paise: ord.total_paise, platform_fee_paise: 0, status: "PENDING", reason: "x",
  });
  ok("over-refund trigger rejects", !!ovErr && ovErr.message.includes("exceed"), ovErr?.message?.slice(0, 60));

  // ===== cancel_event v2 =====
  const { ord: ord3, eid: eid3 } = await confirmedOrder(dev.id, 8000);
  const ce = await adminC.rpc("cancel_event", { p_event_id: eid3, p_reason: "venue fell through", p_cancellation_charge_percent: 20 });
  const { data: ordC } = await s.from("orders").select("status").eq("id", ord3.id).single();
  const { data: refC } = await s.from("refunds").select("status, amount_paise, refund_scope").eq("order_id", ord3.id).maybeSingle();
  const { data: adj } = await s.from("payment_ledger").select("type, gross_amount_paise").eq("razorpay_payment_id", "cancel_adjust_" + eid3).maybeSingle();
  const { data: ev3 } = await s.from("events").select("status").eq("id", eid3).single();
  ok("cancel_event → order REFUND_REQUESTED (not REFUNDED)", ordC.status === "REFUND_REQUESTED", ordC.status + "/" + ev3.status);
  ok("cancel_event → refund PENDING @ subtotal", refC?.status === "PENDING" && refC?.amount_paise === ord3.subtotal_paise && refC?.refund_scope === "TICKET_PRICE", JSON.stringify(refC));
  ok("cancel_event → ADJUSTMENT liability row", adj?.type === "ADJUSTMENT" && adj?.gross_amount_paise === -(ord3.subtotal_paise * 1.2), JSON.stringify(adj));
} catch (e) {
  console.log("ERR", e.message);
  fail++;
} finally {
  for (const id of seed.orders) {
    await s.from("refunds").delete().eq("order_id", id);
    await s.from("tickets").delete().eq("order_id", id);
    await s.from("payment_ledger").delete().eq("order_id", id);
  }
  await s.from("payment_ledger").delete().like("razorpay_payment_id", "cancel_adjust_%");
  if (seed.intents.length) await s.from("payment_intents").delete().in("ref_id", seed.intents);
  if (seed.orders.length) await s.from("orders").delete().in("id", seed.orders);
  if (seed.tiers.length) await s.from("ticket_tiers").delete().in("id", seed.tiers);
  if (seed.events.length) await s.from("events").delete().in("id", seed.events);
  await s.from("event_notifications").delete().in("type", ["REFUND_REQUESTED", "REFUND_APPROVED", "REFUND_REJECTED", "PAYMENT_ALERT"]);
  await c.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}