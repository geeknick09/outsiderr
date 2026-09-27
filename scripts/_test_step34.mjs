// STEP 34 live probe — dispatcher, expiry, fail, webhook claims.
// Run: node scripts/_test_step34.mjs
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

const cleanup = { intents: [], orders: [], tiers: [], events: [], wevents: [], notifs: false };

async function seedEvent(title, price = 10000, qty = 10) {
  const { data: org } = await s.from("organizers").select("id").eq("kyc_status", "APPROVED").limit(1).single();
  const eid = crypto.randomUUID(), tid = crypto.randomUUID();
  await s.from("events").insert({
    id: eid, organizer_id: org.id, title, description: "x", venue_name: "T", venue_address: "x",
    starts_at: new Date(Date.now() + 7 * 864e5).toISOString(), status: "PUBLISHED",
    category: "OTHER", categories: ["OTHER"], city: "KOLKATA", pricing_mode: "PAID",
    created_at: new Date().toISOString(),
  });
  await s.from("ticket_tiers").insert({ id: tid, event_id: eid, name: "GA", price_paise: price, quantity: qty });
  cleanup.events.push(eid); cleanup.tiers.push(tid);
  return { eid, tid };
}

try {
  await c.connect();
  log("pg connected");
  const { data: auth } = await s.auth.admin.listUsers();
  const dev = auth.users.find((u) => u.email === "dev.user@outsiderr.test");
  await anon.auth.signInWithPassword({ email: dev.email, password: "DevTest#1234" });
  log("signed in");

  // --- mismatch + expire ---
  const { eid, tid } = await seedEvent("RZP mismatch");
  const { data: ord4 } = await anon.rpc("create_reserved_order", { p_event_id: eid, p_tier_id: tid, p_quantity: 1 });
  const { data: intent4 } = await s.from("payment_intents").select("id").eq("ref_id", ord4.id).single();
  cleanup.orders.push(ord4.id); cleanup.intents.push(ord4.id);
  const rzpOid2 = "order_mm_" + Date.now();
  await s.rpc("attach_razorpay_order", { p_intent_id: intent4.id, p_razorpay_order_id: rzpOid2 });
  let r = await c.query("select public.apply_captured_payment($1,$2,$3,$4) out", [rzpOid2, "pay_mm_" + Date.now(), 999, "INR"]);
  const { data: intent5 } = await s.from("payment_intents").select("status").eq("id", intent4.id).single();
  const { data: ord5 } = await s.from("orders").select("status").eq("id", ord4.id).single();
  ok("amount mismatch → MISMATCH, order stays RESERVED", r.rows[0].out === "MISMATCH" && intent5.status === "MISMATCH" && ord5.status === "RESERVED", `${r.rows[0].out}/${intent5.status}/${ord5.status}`);
  const { data: alerts } = await s.from("event_notifications").select("type").eq("type", "PAYMENT_ALERT").limit(1);
  ok("PAYMENT_ALERT to admins", alerts.length > 0);
  cleanup.notifs = true;

  await s.from("payment_intents").update({ status: "CREATED", expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", intent4.id);
  const { data: exp } = await s.rpc("expire_payment_intents");
  const { data: ord7 } = await s.from("orders").select("status").eq("id", ord4.id).single();
  const { data: intent6 } = await s.from("payment_intents").select("status").eq("id", intent4.id).single();
  const { data: tier4 } = await s.from("ticket_tiers").select("quantity_reserved").eq("id", tid).single();
  ok("expire_payment_intents → order EXPIRED + intent EXPIRED + reserved released", exp >= 1 && ord7.status === "EXPIRED" && intent6.status === "EXPIRED" && tier4.quantity_reserved === 0, `${ord7.status}/${intent6.status}/res=${tier4.quantity_reserved}`);

  // --- fail path ---
  const { eid: eid3, tid: tid3 } = await seedEvent("RZP fail", 5000, 5);
  const { data: ord8 } = await anon.rpc("create_reserved_order", { p_event_id: eid3, p_tier_id: tid3, p_quantity: 1 });
  const { data: intent8 } = await s.from("payment_intents").select("id").eq("ref_id", ord8.id).single();
  cleanup.orders.push(ord8.id); cleanup.intents.push(ord8.id);
  const rzpOid3 = "order_fail_" + Date.now();
  await s.rpc("attach_razorpay_order", { p_intent_id: intent8.id, p_razorpay_order_id: rzpOid3 });
  r = await c.query("select public.apply_failed_payment($1) out", [rzpOid3]);
  const { data: ord9 } = await s.from("orders").select("status").eq("id", ord8.id).single();
  const { data: intent9 } = await s.from("payment_intents").select("status").eq("id", intent8.id).single();
  const { data: tier5 } = await s.from("ticket_tiers").select("quantity_reserved").eq("id", tid3).single();
  ok("apply_failed_payment → FAILED + reserved released", r.rows[0].out === "FAILED:TICKET_ORDER" && ord9.status === "FAILED" && intent9.status === "FAILED" && tier5.quantity_reserved === 0, `${r.rows[0].out}/${ord9.status}/${intent9.status}/res=${tier5.quantity_reserved}`);

  // --- webhook claim semantics ---
  const evId = "evt_claim_" + Date.now();
  cleanup.wevents.push(evId);
  let cl = await c.query("select * from public.record_webhook_event($1,$2,$3)", [evId, "payment.captured", "{}"]);
  ok("record_webhook_event new claim", cl.rows[0].is_new === true);
  cl = await c.query("select * from public.record_webhook_event($1,$2,$3)", [evId, "payment.captured", "{}"]);
  ok("in-progress claim → skip", cl.rows[0].is_new === false && cl.rows[0].already_processed === false);
  await s.rpc("finish_webhook_event", { p_event_id: evId, p_ok: true });
  cl = await c.query("select * from public.record_webhook_event($1,$2,$3)", [evId, "payment.captured", "{}"]);
  ok("processed → already_processed", cl.rows[0].already_processed === true);
} catch (e) {
  console.log("ERR", e.message);
  fail++;
} finally {
  // cleanup
  await s.from("webhook_events").delete().in("razorpay_event_id", cleanup.wevents);
  if (cleanup.notifs) await s.from("event_notifications").delete().eq("type", "PAYMENT_ALERT");
  if (cleanup.intents.length) await s.from("payment_intents").delete().in("ref_id", cleanup.intents);
  if (cleanup.orders.length) await s.from("orders").delete().in("id", cleanup.orders);
  if (cleanup.tiers.length) await s.from("ticket_tiers").delete().in("id", cleanup.tiers);
  if (cleanup.events.length) await s.from("events").delete().in("id", cleanup.events);
  await c.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}