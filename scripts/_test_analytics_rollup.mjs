/**
 * Analytics rollup verification — exercises the incremental watermark pipeline
 * through the real order lifecycle, plus the cron endpoint (mocked GH Actions
 * call with the real CRON_SECRET).
 *
 * Prereqs: `node scripts/_seed_dev_test.mjs` has run; app serving on :3124.
 * Usage:  node scripts/_test_analytics_rollup.mjs [baseUrl]
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// Node 21 lacks native WebSocket — realtime isn't used here, stub it.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() {} close() {} };
}

const BASE = process.argv[2] ?? "http://localhost:3124";

const env = Object.fromEntries(
  readFileSync(".env", "utf-8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const CRON = env.CRON_SECRET;

const service = createClient(SUPA, SVC, { auth: { persistSession: false } });

let passed = 0, failed = 0;
function report(name, ok, detail = "") {
  const tag = ok ? "✅" : "❌";
  console.log(`${tag} ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? passed++ : failed++;
}

const signIn = async (email) => {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "DevTest#1234" }),
  });
  const j = await r.json();
  return j.access_token;
};
const rpcAs = (token, fn, args) =>
  fetch(`${SUPA}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const refresh = (full = false) =>
  service.rpc("refresh_analytics_rollups", { p_days: 90, p_full: full });

const todayRow = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await service.from("analytics_daily_metrics_v").select("*").eq("day", today).maybeSingle();
  return data;
};
const totals = async () =>
  (await service.from("analytics_totals_v").select("*").eq("id", 1).maybeSingle()).data;
const eventRollup = async (eventId) =>
  (await service.from("analytics_event_rollup_v").select("*").eq("event_id", eventId).maybeSingle()).data;
const userStats = async (uid) =>
  (await service.from("analytics_user_stats_v").select("*").eq("user_id", uid).maybeSingle()).data;

async function main() {
  console.log(`\nRollup E2E vs ${SUPA}\n`);

  // ---- fixture: fresh event + tier -----------------------------------------
  const orgToken = await signIn("dev.organizer@outsiderr.test");
  const userToken = await signIn("dev.user2@outsiderr.test");
  const orgUid = (await (await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${orgToken}` } })).json()).id;
  const { data: org } = await service
    .from("organizers").select("id, owner_id").eq("owner_id", orgUid).single();

  const uid = (await (await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${userToken}` } })).json()).id;

  const stamp = Date.now();
  const { data: ev, error: evErr } = await service.from("events").insert({
    title: `ROLLUPTEST ${stamp}`,
    organizer_id: org.id,
    description: "rollup test",
    category: "JAM_GIG", categories: ["JAM_GIG"], city: "KOLKATA",
    venue_name: "Test", venue_address: "123 Test St",
    google_maps_link: "https://maps.google.com/?q=kolkata",
    pricing_mode: "FLAT", status: "PUBLISHED",
    waitlist_enabled: true, terms: ["t"],
    starts_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
    commission_bps: 1000, commission_enabled: true,
    convenience_fee_bps: 200, convenience_fee_enabled: true,
    fee_payer: "BUYER",
  }).select().single();
  if (evErr) { console.error("event insert failed:", evErr.message); process.exit(1); }
  const { data: tier, error: tierErr } = await service.from("ticket_tiers").insert({
    event_id: ev.id, name: "GA", price_paise: 50000, quantity: 10, perks: [],
  }).select().single();
  if (tierErr) { console.error("tier insert failed:", tierErr.message); process.exit(1); }

  // ---- baseline -------------------------------------------------------------
  const t0 = await refresh();
  report("T1. baseline refresh ok", !t0.error, t0.error?.message ?? "");
  const totalsBefore = await totals();
  const dayBefore = await todayRow();
  const statsBefore = await userStats(uid);

  // ---- create order → incremental refresh -----------------------------------
  const create = await rpcAs(userToken, "create_paid_order", {
    p_event_id: ev.id, p_tier_id: tier.id, p_quantity: 1,
    p_unit_price_paise: 0, p_subtotal_paise: 0, p_platform_fee_paise: 0,
    p_total_paise: 0, p_fee_payer: "BUYER", p_utr_reference: "ROLLUP",
    p_payment_proof_url: null, p_buyer_name: "Rollup Test",
    p_buyer_phone: null, p_buyer_email: null, p_buyer_gender: null,
    p_commission_paise: 0, p_convenience_fee_paise: 0, p_organizer_payout_paise: 0,
  });
  const orderId = create.body?.id ?? create.body?.[0]?.id;
  report("T2. order created (PENDING)", create.status === 200 && !!orderId, `status=${create.status}`);

  await refresh();
  const dayMid = await todayRow();
  report(
    "T3. incremental refresh: created bucket +1, confirmed unchanged",
    dayMid.orders_created === (dayBefore?.orders_created ?? 0) + 1 &&
      dayMid.orders_confirmed === (dayBefore?.orders_confirmed ?? 0),
    `created=${dayMid.orders_created} confirmed=${dayMid.orders_confirmed}`,
  );
  const earlyRollup = await eventRollup(ev.id);
  report("T4. event_rollup has 0 confirmed (nothing confirmed yet)", earlyRollup == null || earlyRollup.confirmed_orders === 0, JSON.stringify(earlyRollup?.confirmed_orders));

  // ---- approve → confirmed rollups ------------------------------------------
  const approve = await rpcAs(orgToken, "approve_order", { p_order_id: orderId });
  report("T5. organizer approve", approve.status === 200, `status=${approve.status}`);

  await refresh();
  const dayAfter = await todayRow();
  const rollup = await eventRollup(ev.id);
  const statsAfter = await userStats(uid);
  const totalsAfter = await totals();
  report(
    "T6. confirmed bucket +1, gross +50000",
    dayAfter.orders_confirmed === dayMid.orders_confirmed + 1 &&
      dayAfter.gross_paise === dayMid.gross_paise + 50000,
    `confirmed=${dayAfter.orders_confirmed} gross=${dayAfter.gross_paise}`,
  );
  report(
    "T7. event_rollup row — 1 order, ₹500 gross, ₹450 payout",
    rollup?.confirmed_orders === 1 && rollup?.gross_paise === 50000 && rollup?.organizer_payout_paise === 45000,
    JSON.stringify(rollup && { o: rollup.confirmed_orders, g: rollup.gross_paise, p: rollup.organizer_payout_paise }),
  );
  report(
    "T8. user_order_stats incremented",
    (statsAfter?.confirmed_orders ?? 0) === (statsBefore?.confirmed_orders ?? 0) + 1,
    `${statsBefore?.confirmed_orders ?? 0} → ${statsAfter?.confirmed_orders}`,
  );
  report(
    "T9. totals: confirmed+1, volume+51000",
    totalsAfter.confirmed_payments === totalsBefore.confirmed_payments + 1 &&
      totalsAfter.total_volume_paise === totalsBefore.total_volume_paise + 51000,
    `vol=${totalsAfter.total_volume_paise}`,
  );

  // ---- cancel → status flip decrements confirmed buckets --------------------
  const cancel = await rpcAs(orgToken, "cancel_event", {
    p_event_id: ev.id, p_reason: "rollup test", p_cancellation_charge_percent: 0,
  });
  report("T10. cancel event", cancel.status === 200, `status=${cancel.status} ${JSON.stringify(cancel.body).slice(0,120)}`);

  await refresh();
  const dayEnd = await todayRow();
  const rollupEnd = await eventRollup(ev.id);
  report(
    "T11. cancel → confirmed bucket back down, gross reverts",
    dayEnd.orders_confirmed === dayMid.orders_confirmed && dayEnd.gross_paise === dayMid.gross_paise,
    `confirmed=${dayEnd.orders_confirmed} gross=${dayEnd.gross_paise}`,
  );
  report(
    "T12. event_rollup shows 0 confirmed after cancel",
    rollupEnd == null || rollupEnd.confirmed_orders === 0,
    JSON.stringify(rollupEnd && rollupEnd.confirmed_orders),
  );

  // ---- idempotency + full rebuild -------------------------------------------
  await refresh();
  const totalsAgain = await totals();
  report(
    "T13. re-run idempotent",
    totalsAgain.confirmed_payments === totalsBefore.confirmed_payments,
    `confirmed=${totalsAgain.confirmed_payments}`,
  );
  const fullRes = await refresh(true);
  report("T14. full rebuild (p_full) succeeds", !fullRes.error, fullRes.error?.message ?? "");

  // ---- cron endpoint (mock GH Actions) --------------------------------------
  const bad = await fetch(`${BASE}/api/cron/refresh-analytics`, { headers: { authorization: "Bearer wrong" } });
  report("T15. cron endpoint rejects bad secret → 401", bad.status === 401, `status=${bad.status}`);
  const good = await fetch(`${BASE}/api/cron/refresh-analytics`, { headers: { authorization: `Bearer ${CRON}` } });
  const goodBody = await good.json().catch(() => ({}));
  report("T16. cron endpoint with secret → 200", good.status === 200 && goodBody.status === "ok", `status=${good.status}`);

  // ---- notification outbox ---------------------------------------------------
  const enq = await service.rpc("enqueue_notification_outbox", {
    p_user_id: uid, p_event_id: null, p_type: "ORDER_CONFIRMED",
    p_title: "t", p_message: "outbox probe", p_channel: "push",
  });
  const outboxId = enq.data;
  report("T17. outbox enqueue → id", !enq.error && !!outboxId, enq.error?.message ?? String(outboxId).slice(0, 40));

  const claimed = await service.rpc("claim_notification_outbox", { p_batch: 10 });
  const claimedRow = (claimed.data ?? []).find((r) => r.id === outboxId);
  report("T18. claim picks up the row (SENDING, attempts=1)", !!claimedRow && claimedRow.attempts === 1, `claimed=${claimed.data?.length ?? 0}`);

  await service.rpc("complete_notification_outbox", { p_id: outboxId, p_success: false, p_error: "probe fail" });
  const { data: afterFail } = await service.from("notification_outbox").select("status, attempts, next_attempt_at").eq("id", outboxId).single();
  report("T19. failed delivery → back to PENDING with backoff", afterFail?.status === "PENDING" && new Date(afterFail.next_attempt_at) > new Date(), `status=${afterFail?.status} next=${afterFail?.next_attempt_at}`);

  // drain endpoint without provider → skipped (doesn't claim)
  const drain = await fetch(`${BASE}/api/cron/drain-notifications`, { headers: { authorization: `Bearer ${CRON}` } });
  const drainBody = await drain.json().catch(() => ({}));
  report("T20. drain endpoint no-provider → skipped", drain.status === 200 && drainBody.status === "skipped", `status=${drain.status} ${drainBody.reason ?? ""}`);

  await service.rpc("complete_notification_outbox", { p_id: outboxId, p_success: true });
  const { data: afterOk } = await service.from("notification_outbox").select("status").eq("id", outboxId).single();
  report("T21. successful completion → SENT", afterOk?.status === "SENT", `status=${afterOk?.status}`);
  await service.from("notification_outbox").delete().eq("id", outboxId);

  // ---- cleanup (FK order: ledger → refunds → tickets → orders → tiers → event)
  await service.from("payment_ledger").delete().eq("order_id", orderId);
  await service.from("refunds").delete().eq("order_id", orderId);
  await service.from("tickets").delete().eq("event_id", ev.id);
  await service.from("orders").delete().eq("event_id", ev.id);
  await service.from("ticket_tiers").delete().eq("event_id", ev.id);
  await service.from("events").delete().eq("id", ev.id);

  console.log(`\n${"=".repeat(55)}\n${passed}/${passed + failed} passed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
