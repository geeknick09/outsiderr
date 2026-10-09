// E2E scenario runner for /api/v1 + booking/inventory/waitlist/scanner flows.
// Usage: node scripts/_e2e_dev_test.mjs [baseUrl]   (default http://localhost:3124)
// Requires dev server running + `node scripts/_seed_dev_test.mjs` already run.
// IDEMPOTENT — resets all test data at start; safe to re-run.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() {} close() {} };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const envVar = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const SB_URL = envVar("NEXT_PUBLIC_SUPABASE_URL");
const ANON = envVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = envVar("SUPABASE_SERVICE_ROLE_KEY");
const BASE = process.argv[2] ?? "http://localhost:3124";
const PW = "DevTest#1234";

const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(SB_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function signIn(email) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return { token: data.session.access_token, uid: data.user.id };
}
async function api(path, { method = "POST", token, body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}
function userClient(token) {
  return createClient(SB_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const getTier = async (id) => (await admin.from("ticket_tiers").select("*").eq("id", id).single()).data;
const getOrders = async (eventId) => (await admin.from("orders").select("*").eq("event_id", eventId).order("created_at")).data ?? [];
const getTickets = async (orderId) => (await admin.from("tickets").select("*").eq("order_id", orderId)).data ?? [];
// Paid order via the real Razorpay path: reservation RPC (authenticated user)
// + simulated gateway capture through the shared dispatcher (service role plays
// the webhook). Money is computed server-side - no client-supplied amounts.
const reserveOrder = (u, eventId, tierId, extra = {}) =>
  userClient(u.token).rpc("create_reserved_order", {
    p_event_id: eventId, p_tier_id: tierId, p_quantity: extra.qty ?? 1,
    p_idempotency_key: null,
    p_buyer_name: extra.name ?? "Dev Buyer", p_buyer_phone: extra.phone ?? "+919000000000",
    p_buyer_email: null, p_buyer_gender: null,
  });

async function captureOrder(orderId) {
  const intent = (await admin.from("payment_intents").select("id,amount_paise")
    .eq("ref_id", orderId).eq("kind", "TICKET_ORDER").single()).data;
  if (!intent) return { error: { message: "no payment intent" } };
  const rzp = `order_e2e_${orderId.slice(0, 8)}`;
  await admin.from("payment_intents").update({ razorpay_order_id: rzp }).eq("id", intent.id);
  await admin.from("orders").update({ razorpay_order_id: rzp }).eq("id", orderId);
  return admin.rpc("apply_captured_payment", {
    p_razorpay_order_id: rzp,
    p_razorpay_payment_id: `pay_e2e_${orderId.slice(0, 8)}_${Date.now()}`,
    p_amount: intent.amount_paise, p_currency: "INR", p_method: "upi", p_fee: 0,
  });
}

async function main() {
  console.log(`E2E vs ${BASE} · ${new URL(SB_URL).host}\n`);

  const U = {};
  for (const [k, email] of Object.entries({ u1: "dev.user@outsiderr.test", u2: "dev.user2@outsiderr.test", org: "dev.organizer@outsiderr.test", org2: "dev.organizer2@outsiderr.test", adm: "dev.admin@outsiderr.test" })) {
    U[k] = await signIn(email);
  }
  report("A1. all 5 roles sign in (real JWT)", true);

  const me = await api("/me", { method: "GET", token: U.u1.token });
  report("A2. GET /me returns user", me.status === 200 && me.ok && me.data?.user?.email === "dev.user@outsiderr.test", JSON.stringify(me.data?.user?.email ?? me.error));
  const meNoAuth = await api("/me", { method: "GET" });
  report("A3. /me no auth → 401", meNoAuth.status === 401 && meNoAuth.ok === false);

  // ── fixtures + reset ──────────────────────────────────────────────
  const { data: ev } = await admin.from("events").select("id,title,organizer_id,created_at").ilike("title", "DEVTEST%").order("created_at");
  const paid = ev.find((e) => e.title.startsWith("DEVTEST Paid Jam"));
  const free = ev.find((e) => e.title.startsWith("DEVTEST Free Session"));
  const tiny = ev.find((e) => e.title.startsWith("DEVTEST Tiny Event"));
  const draft = ev.find((e) => e.title.startsWith("DEVTEST Draft Event"));
  if (!(paid && free && tiny && draft)) {
    report("A4. seeded fixtures found", false, "missing — run `node scripts/_seed_dev_test.mjs`");
    process.exit(1);
  }
  const { data: tiers } = await admin.from("ticket_tiers").select("*").in("event_id", ev.map((e) => e.id));
  const paidTier = tiers.find((t) => t.event_id === paid.id);
  const freeTier = tiers.find((t) => t.event_id === free.id);
  const tinyTier = tiers.find((t) => t.event_id === tiny.id);
  report("A4. seeded fixtures found", !!(paid && free && tiny && draft && paidTier && freeTier && tinyTier));

  // reset: wipe all test-generated state on the seeded events/users
  const testEventIds = [paid.id, free.id, tiny.id, draft.id];
  const testUids = [U.u1.uid, U.u2.uid, U.org.uid, U.org2.uid, U.adm.uid];
  const testOrderIds = (await admin.from("orders").select("id").in("event_id", testEventIds)).data?.map((o) => o.id) ?? [];
  // ledger/intents/refunds/scan_log FK-reference orders+tickets — clear first.
  try { await admin.from("scan_log").delete().in("event_id", testEventIds); } catch {}
  try { await admin.from("payment_ledger").delete().in("event_id", testEventIds); } catch {}
  try { if (testOrderIds.length) await admin.from("payment_ledger").delete().in("order_id", testOrderIds); } catch {}
  try { if (testOrderIds.length) await admin.from("payment_intents").delete().in("ref_id", testOrderIds); } catch {}
  try { await admin.from("refunds").delete().in("event_id", testEventIds); } catch {}
  if (testOrderIds.length) await admin.from("tickets").delete().in("order_id", testOrderIds);
  try { await admin.from("tickets").delete().in("event_id", testEventIds).is("order_id", null); } catch {}
  const ordDel = await admin.from("orders").delete().in("event_id", testEventIds);
  if (ordDel.error) console.log("reset: orders delete failed:", ordDel.error.message);
  await admin.from("waitlist").delete().in("event_id", testEventIds);
  await admin.from("event_subscriptions").delete().in("event_id", testEventIds);
  await admin.from("organizer_follows").delete().eq("organizer_id", paid.organizer_id);
  await admin.from("event_notifications").delete().in("event_id", testEventIds);
  await admin.from("event_notifications").delete().in("user_id", testUids);
  try { await admin.from("event_reviews").delete().in("event_id", testEventIds); } catch {}
  try { await admin.from("event_collaborators").delete().in("event_id", testEventIds); } catch {}
  try {
    const clubIds = (await admin.from("communities").select("id").ilike("name", "DEVTEST%")).data?.map((c) => c.id) ?? [];
    if (clubIds.length) {
      // community events + children must go before the community row itself
      const commEvIds = (await admin.from("events").select("id").in("community_id", clubIds)).data?.map((e) => e.id) ?? [];
      if (commEvIds.length) {
        const commOrderIds = (await admin.from("orders").select("id").in("event_id", commEvIds)).data?.map((o) => o.id) ?? [];
        if (commOrderIds.length) {
          await admin.from("tickets").delete().in("order_id", commOrderIds);
          await admin.from("orders").delete().in("id", commOrderIds);
        }
        await admin.from("ticket_tiers").delete().in("event_id", commEvIds);
        await admin.from("events").delete().in("id", commEvIds);
      }
      await admin.from("community_invites").delete().in("community_id", clubIds);
      await admin.from("community_members").delete().in("community_id", clubIds);
      await admin.from("community_join_questions").delete().in("community_id", clubIds);
      await admin.from("community_follows").delete().in("community_id", clubIds);
      await admin.from("communities").delete().in("id", clubIds);
    }
    // group-event tiers/orders made by the T-section
    const ge = (await admin.from("events").select("id").ilike("title", "DEVTEST Group Event%")).data?.map((e) => e.id) ?? [];
    if (ge.length) {
      const goIds = (await admin.from("orders").select("id").in("event_id", ge)).data?.map((o) => o.id) ?? [];
      if (goIds.length) {
        await admin.from("tickets").delete().in("order_id", goIds);
        await admin.from("orders").delete().in("id", goIds);
      }
      await admin.from("ticket_tiers").delete().in("event_id", ge);
      await admin.from("events").delete().in("id", ge);
    }
  } catch {}
  await admin.from("ticket_tiers").update({ quantity_sold: 0, quantity_reserved: 0 }).in("event_id", testEventIds);
  await admin.from("events").update({ status: "PUBLISHED", title: "DEVTEST Paid Jam" }).eq("id", paid.id);
  await admin.from("events").update({ status: "PUBLISHED" }).eq("id", free.id);
  await admin.from("events").update({ status: "DRAFT" }).eq("id", draft.id);
  report("A5. test state reset", true);

  // ── free booking ──────────────────────────────────────────────────
  const freeOrder = await api("/orders/manual", { token: U.u1.token, body: { eventId: free.id, tierId: freeTier.id, quantity: 1, isFree: true, buyerName: "Dev User", buyerPhone: "+919876543210" } });
  report("B1. free RSVP → submitted", freeOrder.ok === true, JSON.stringify(freeOrder));
  const fo = (await getOrders(free.id)).filter((o) => o.user_id).pop();
  const foTickets = fo ? await getTickets(fo.id) : [];
  report("B2. free order CONFIRMED + VALID ticket", fo?.status === "CONFIRMED" && foTickets.length === 1 && foTickets[0].status === "VALID", `order=${fo?.status} tickets=${foTickets.length}`);

  // Per-user cap: booking is capped at max_tickets_per_user (default 5), not
  // "one order per event" - force the cap to 1 so a second RSVP must fail.
  await admin.from("events").update({ max_tickets_per_user: 1 }).eq("id", free.id);
  const dupe = await api("/orders/manual", { token: U.u1.token, body: { eventId: free.id, tierId: freeTier.id, quantity: 1, isFree: true } });
  report("B3. booking over per-user cap blocked", dupe.ok === false, JSON.stringify(dupe.error ?? ""));
  await admin.from("events").update({ max_tickets_per_user: 5 }).eq("id", free.id);

  // ── paid order: reserve → gateway capture (webhook path) ──────────
  const reserved = await reserveOrder(U.u2, paid.id, paidTier.id, { name: "User Two", phone: "+919111111111" });
  report("C1. paid order reserved", !reserved.error && !!reserved.data?.id, JSON.stringify(reserved.error ?? ""));
  const mo = (await getOrders(paid.id)).filter((o) => o.user_id === U.u2.uid).pop();
  report("C2. order RESERVED + intent exists", mo?.status === "RESERVED" && !!(await admin.from("payment_intents").select("id").eq("ref_id", mo?.id ?? "").maybeSingle()).data, `status=${mo?.status}`);

  const badApprove = await api(`/orders/${mo.id}/approve`, { token: U.u1.token });
  report("C3. non-staff approve blocked", badApprove.ok === false, JSON.stringify(badApprove.error ?? ""));

  const capture = await captureOrder(mo.id);
  const moAfter = (await admin.from("orders").select("status").eq("id", mo.id).single()).data;
  const moTickets = await getTickets(mo.id);
  report("C4. captured payment → CONFIRMED + ticket", capture?.data === "APPLIED:TICKET_ORDER" && moAfter?.status === "CONFIRMED" && moTickets.length === 1, `capture=${capture?.data ?? capture?.error?.message} status=${moAfter?.status} tickets=${moTickets.length}`);

  const captureAgain = await captureOrder(mo.id);
  report("C5. repeat capture idempotent (ALREADY_PAID)", captureAgain?.data === "ALREADY_PAID", `res=${captureAgain?.data ?? captureAgain?.error?.message}`);

  // Legacy pending-verification row (only creatable via fixture now) → reject
  const [po] = (await admin.from("orders").insert({
    event_id: paid.id, tier_id: paidTier.id, user_id: U.u1.uid, quantity: 1,
    unit_price_paise: 10000, subtotal_paise: 10000, platform_fee_paise: 1200,
    commission_paise: 1000, convenience_fee_paise: 200, organizer_payout_paise: 9000,
    total_paise: 10200, fee_payer: "BUYER", status: "PENDING_VERIFICATION",
    buyer_name: "Pending U1", buyer_phone: "+919222222222", utr_reference: "BADUTR",
  }).select("id")).data ?? [];
  const rejPend = await api(`/orders/${po.id}/reject`, { token: U.org.token, body: { reason: "UTR not found" } });
  const poAfter = (await admin.from("orders").select("status").eq("id", po.id).single()).data;
  report("C6. reject PENDING order → REJECTED", rejPend.ok === true && poAfter?.status === "REJECTED", `status=${poAfter?.status}`);

  // CONFIRMED orders must NOT be rejectable (real money → refund flow)
  const rejConfirmed = await api(`/orders/${mo.id}/reject`, { token: U.org.token, body: { reason: "x" } });
  const moStill = (await admin.from("orders").select("status").eq("id", mo.id).single()).data;
  report("C7. reject CONFIRMED blocked", rejConfirmed.ok === false && moStill?.status === "CONFIRMED", `err=${rejConfirmed.error ?? ""} status=${moStill?.status}`);

  // ── checkout (Razorpay: reservation + session, or clean error) ──────
  // adm has no orders on this event; u1/u2 already hold confirmed/pending rows.
  const co = await api("/checkout", { token: U.adm.token, body: { eventId: paid.id, tierId: paidTier.id, quantity: 1 } });
  report("D1. checkout → session or clean error", (co.ok === true && !!co.data?.session) || (co.ok === false && typeof co.error === "string"), JSON.stringify(co.error ?? co.data?.session?.orderId ?? co));
  // Release the reservation so it doesn't leak into later assertions.
  const coOrder = (await getOrders(paid.id)).filter((o) => o.user_id === U.adm.uid).pop();
  if (coOrder) {
    await admin.from("payment_intents").delete().eq("ref_id", coOrder.id);
    await admin.from("orders").delete().eq("id", coOrder.id);
  }

  // ── engagement ────────────────────────────────────────────────────
  const sub = await api(`/events/${tiny.id}/subscribe`, { token: U.u2.token });
  const subRow = await admin.from("event_subscriptions").select("id").eq("event_id", tiny.id).eq("user_id", U.u2.uid).maybeSingle();
  report("E1. subscribe → row created", sub.ok === true && !!subRow.data, JSON.stringify(sub.error ?? ""));
  const subAgain = await api(`/events/${tiny.id}/subscribe`, { token: U.u2.token });
  report("E2. re-subscribe idempotent", subAgain.ok === true, JSON.stringify(subAgain.error ?? ""));
  const unsub = await api(`/events/${tiny.id}/subscribe`, { method: "DELETE", token: U.u2.token });
  const subGone = await admin.from("event_subscriptions").select("id").eq("event_id", tiny.id).eq("user_id", U.u2.uid).maybeSingle();
  report("E3. unsubscribe removes row", unsub.ok === true && !subGone.data);

  const fol = await api(`/organizers/${paid.organizer_id}/follow`, { token: U.u1.token });
  const folRow = await admin.from("organizer_follows").select("id").eq("organizer_id", paid.organizer_id).eq("follower_id", U.u1.uid).maybeSingle();
  report("E4. follow organizer → row", fol.ok === true && !!folRow.data, JSON.stringify(fol.error ?? ""));
  await api(`/organizers/${paid.organizer_id}/follow`, { method: "DELETE", token: U.u1.token });

  // subscribe while holding a ticket → blocked by design
  const subWithTicket = await api(`/events/${paid.id}/subscribe`, { token: U.u2.token });
  report("E5. ticket-holder subscribe blocked", subWithTicket.ok === false, JSON.stringify(subWithTicket.error ?? ""));

  // ── profile + notifications ───────────────────────────────────────
  const prof = await api("/profile", { method: "PATCH", token: U.u1.token, body: { fullName: "Dev User Updated", gender: "male" } });
  const profRow = (await admin.from("profiles").select("full_name,gender").eq("id", U.u1.uid).single()).data;
  report("F1. profile PATCH persists", prof.ok === true && profRow?.full_name === "Dev User Updated", profRow?.full_name);
  const nr = await api("/notifications/read", { token: U.u1.token, body: { all: true } });
  report("F2. notifications mark-all-read", nr.ok === true);

  // ── capacity + waitlist FIFO (tiny event qty=2) ───────────────────
  // u1 + u2 book both seats (reserve → capture = real paid path)
  await reserveOrder(U.u1, tiny.id, tinyTier.id, { name: "U1", phone: "+919000000001" });
  await reserveOrder(U.u2, tiny.id, tinyTier.id, { name: "U2", phone: "+919000000002" });
  const tinyOrders = (await getOrders(tiny.id)).filter((o) => o.status === "RESERVED");
  for (const o of tinyOrders) await captureOrder(o.id);
  const tinyAfter = await getTier(tinyTier.id);
  report("G1. tiny event sold out (2/2)", tinyAfter.quantity_sold === 2, `sold=${tinyAfter.quantity_sold}`);

  const soldOut = await reserveOrder(U.adm, tiny.id, tinyTier.id, { name: "U3", phone: "+919000000003" });
  report("G2. sold-out booking blocked", !!soldOut.error, JSON.stringify(soldOut.error?.message ?? ""));

  // waitlist join via direct RPC (what mobile does)
  const u3 = userClient(U.adm.token);
  const { data: wl, error: wlErr } = await u3.rpc("join_waitlist", { p_event_id: tiny.id, p_tier_id: tinyTier.id });
  report("G3. waitlist join → position 1 WAITING", wl?.position === 1 && wl?.status === "WAITING", JSON.stringify(wl ?? wlErr));

  // capacity guard: offer while tier is full → null (no phantom offer)
  const orgC = userClient(U.org.token);
  const { data: offerFull } = await orgC.rpc("offer_waitlist_next", { p_tier_id: tinyTier.id });
  const wlStillWaiting = (await admin.from("waitlist").select("status").eq("event_id", tiny.id).maybeSingle()).data;
  // PostgREST serializes a null composite return as {id:null,...}
  const noOffer = offerFull === null || offerFull?.id == null;
  report("G4. offer while sold-out → no phantom offer", noOffer && wlStillWaiting?.status === "WAITING", `offer_id=${offerFull?.id ?? "null"} status=${wlStillWaiting?.status}`);

  // free a seat (simulate refund/cancel: sold 2→1 + void ticket) → offer fires
  const confirmedOrder = (await getOrders(tiny.id)).find((o) => o.status === "CONFIRMED");
  if (confirmedOrder) {
    await admin.from("tickets").update({ status: "VOID" }).eq("order_id", confirmedOrder.id);
    await admin.from("orders").update({ status: "CANCELLED" }).eq("id", confirmedOrder.id);
    await admin.from("ticket_tiers").update({ quantity_sold: 1 }).eq("id", tinyTier.id);
    const { data: offer } = await orgC.rpc("offer_waitlist_next", { p_tier_id: tinyTier.id });
    const wlAfter = (await admin.from("waitlist").select("*").eq("event_id", tiny.id).maybeSingle()).data;
    report("G5. freed seat → waitlist OFFERED (FIFO)", offer?.user_id === U.adm.uid && wlAfter?.status === "OFFERED", `status=${wlAfter?.status}`);
    const expiryOk = wlAfter?.expires_at && (new Date(wlAfter.expires_at) - new Date(wlAfter.offered_at)) === 86400000;
    report("G6. offer carries 24h expiry window", expiryOk === true, `expires=${wlAfter?.expires_at}`);

    // ── waitlist FIFO ordering (2 waiters) ──
    const { data: wl2 } = await userClient(U.u2.token).rpc("join_waitlist", { p_event_id: tiny.id, p_tier_id: tinyTier.id });
    report("G7. second waiter joins → position 2", wl2?.position === 2 && wl2?.status === "WAITING", `pos=${wl2?.position} status=${wl2?.status}`);
    // expire u3's offer → requeue to true back of queue
    await admin.from("waitlist").update({ expires_at: new Date(Date.now() - 3600e3).toISOString() }).eq("id", wl.id);
    // requeue_waitlist_entry is service-role only after the RPC lockdown
    await admin.rpc("requeue_waitlist_entry", { p_entry_id: wl.id });
    const u3After = (await admin.from("waitlist").select("status,position").eq("id", wl.id).single()).data;
    report("G8. lapsed offer re-queued to back", u3After?.status === "WAITING" && u3After?.position > wl2.position, `u3 pos=${u3After?.position}`);
    // next offer goes to u2 (earlier position), not the re-queued u3
    const { data: offer2 } = await orgC.rpc("offer_waitlist_next", { p_tier_id: tinyTier.id });
    report("G9. freed seat offers earlier waiter (FIFO)", offer2?.user_id === U.u2.uid && offer2?.status === "OFFERED", `offered=${offer2?.user_id}`);
  } else {
    report("G5-G6. no confirmed order to free", false);
  }

  // ── scanner ───────────────────────────────────────────────────────
  const sl = await api("/scanner/login", { body: { eventId: paid.id, pin: "123456" } });
  report("H1. scanner PIN login", sl.ok === true && sl.data?.event?.id === paid.id, JSON.stringify(sl.data?.event?.title ?? sl.error));
  const slBad = await api("/scanner/login", { body: { eventId: paid.id, pin: "999999" } });
  report("H2. wrong PIN → 401", slBad.status === 401 && slBad.ok === false, JSON.stringify(slBad.error ?? ""));

  const qrHash = moTickets[0]?.qr_hash;
  if (qrHash) {
    const scan1 = await api("/scanner/check-in", { body: { qrHash, eventId: paid.id, pin: "123456" } });
    report("H3. check-in VALID ticket", scan1.ok === true && scan1.data?.outcome === "VALID", JSON.stringify(scan1.data));
    const scan2 = await api("/scanner/check-in", { body: { qrHash, eventId: paid.id, pin: "123456" } });
    report("H4. re-scan → already used", scan2.ok === true && scan2.data?.outcome !== "VALID", `outcome=${scan2.data?.outcome}`);
    const scanWrong = await api("/scanner/check-in", { body: { qrHash, eventId: free.id, pin: "123456" } });
    report("H5. wrong-event scan rejected", scanWrong.ok === true && scanWrong.data?.outcome !== "VALID", `outcome=${scanWrong.data?.outcome}`);
    const scanFake = await api("/scanner/check-in", { body: { qrHash: "f".repeat(64), eventId: paid.id, pin: "123456" } });
    report("H6. forged QR rejected", scanFake.ok === true && scanFake.data?.outcome === "INVALID", `outcome=${scanFake.data?.outcome}`);
  } else {
    report("H3-H6. no ticket to scan", false, "moTickets empty");
  }

  // ── box office ────────────────────────────────────────────────────
  const bol = await api("/box-office/login", { body: { eventId: paid.id, pin: "654321" } });
  report("I1. box-office PIN login", bol.ok === true, JSON.stringify(bol.data?.event?.staffName ?? bol.error));
  const bo = await api("/box-office/orders", { body: { eventId: paid.id, pin: "654321", tierId: paidTier.id, buyerName: "Door Buyer", buyerPhone: "+919000000000", mode: "WALKIN_INSTANT" } });
  report("I2. box-office order → ticket", bo.ok === true && !!bo.data?.orderId, JSON.stringify(bo.data ?? bo.error));
  const boTicket = bo.data?.ticketId ? (await admin.from("tickets").select("status").eq("id", bo.data.ticketId).single()).data : null;
  report("I3. walkin-instant ticket is USED", boTicket?.status === "USED", `status=${boTicket?.status}`);
  // idempotency
  const idem = crypto.randomUUID();
  const bo1 = await api("/box-office/orders", { body: { eventId: paid.id, pin: "654321", tierId: paidTier.id, buyerName: "Idem Buyer", buyerPhone: "+919000000009", mode: "WALKIN_INSTANT", idempotencyKey: idem } });
  const bo2 = await api("/box-office/orders", { body: { eventId: paid.id, pin: "654321", tierId: paidTier.id, buyerName: "Idem Buyer", buyerPhone: "+919000000009", mode: "WALKIN_INSTANT", idempotencyKey: idem } });
  const sameOrder = bo1.data?.orderId && bo1.data?.orderId === bo2.data?.orderId;
  report("I4. box-office idempotency (same key → same order)", sameOrder === true, `o1=${bo1.data?.orderId} o2=${bo2.data?.orderId}`);

  // ── organizer event ops ───────────────────────────────────────────
  const upd = await api(`/events/${paid.id}`, { method: "PATCH", token: U.org.token, body: { title: "DEVTEST Paid Jam (edited)", startsAt: new Date(Date.now() + 8 * 864e5).toISOString(), endsAt: new Date(Date.now() + 8.25 * 864e5).toISOString(), venueTba: true } });
  const evAfter = (await admin.from("events").select("title").eq("id", paid.id).single()).data;
  report("J1. PATCH event title persists", upd.ok === true && evAfter?.title === "DEVTEST Paid Jam (edited)", `${evAfter?.title} (err=${upd.error ?? "none"})`);

  const pub = await api(`/events/${draft.id}/publish`, { token: U.org.token });
  const draftAfter = (await admin.from("events").select("status").eq("id", draft.id).single()).data;
  report("J2. publish draft", pub.ok === true && draftAfter?.status === "PUBLISHED", `status=${draftAfter?.status} err=${pub.error ?? "none"}`);

  const post = await api(`/events/${free.id}/postpone`, { token: U.org.token, body: { startsAt: new Date(Date.now() + 10 * 864e5).toISOString(), endsAt: new Date(Date.now() + 10.25 * 864e5).toISOString(), reason: "venue change" } });
  const freeAfter = (await admin.from("events").select("status").eq("id", free.id).single()).data;
  report("J3. postpone → POSTPONED", post.ok === true && freeAfter?.status === "POSTPONED", `status=${freeAfter?.status} err=${post.error ?? "none"}`);

  const updBad = await api(`/events/${paid.id}`, { method: "PATCH", token: U.u1.token, body: { title: "HACKED", startsAt: new Date(Date.now() + 8 * 864e5).toISOString() } });
  const evNotHacked = (await admin.from("events").select("title").eq("id", paid.id).single()).data;
  report("J4. non-owner edit blocked", updBad.ok === false && evNotHacked?.title !== "HACKED", `resp=${updBad.status} title=${evNotHacked?.title}`);

  const pins = await api("/pins", { token: U.org.token, body: { eventId: paid.id, type: "scanner", staffNames: ["E2E Pin Gen"] } });
  report("J5. generate scanner pin via API", pins.ok === true && !!pins.data?.pins?.[0]?.pinCode, JSON.stringify(pins.data?.pins?.[0]?.pinCode ?? pins.error));

  // ── concurrency burst ─────────────────────────────────────────────
  const { data: burstEvent } = await admin.from("events").insert({
    organizer_id: paid.organizer_id, title: `DEVTEST Burst ${Date.now()}`, description: "burst",
    category: "JAM_GIG", categories: ["JAM_GIG"], city: "KOLKATA", venue_name: "V", venue_address: "",
    google_maps_link: "https://maps.google.com/?q=x", starts_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    ends_at: new Date(Date.now() + 7.25 * 864e5).toISOString(), pricing_mode: "PAID",
  }).select("id").single();
  const { data: burstTier } = await admin.from("ticket_tiers").insert({ event_id: burstEvent.id, name: "GA", price_paise: 10000, quantity: 3, perks: [] }).select("id").single();
  const burstClients = [U.u1, U.u2, U.adm, U.org, U.u1].map((u) => userClient(u.token));
  const burstResults = await Promise.allSettled(
    burstClients.map((c) => c.rpc("create_reserved_order", {
      p_event_id: burstEvent.id, p_tier_id: burstTier.id, p_quantity: 1,
      p_idempotency_key: null,
      p_buyer_name: "Burst", p_buyer_phone: "+919000000000",
    })),
  );
  const burstOk = burstResults.filter((r) => r.status === "fulfilled" && !r.value.error).length;
  const burstTierAfter = await getTier(burstTier.id);
  report("K1. burst: 5 buyers × qty-3 → ≤3 succeed", burstOk <= 3, `succeeded=${burstOk}`);
  report("K2. no oversell (reserved ≤ qty)", burstTierAfter.quantity_reserved <= 3 && burstTierAfter.quantity_reserved === Math.min(3, burstOk), `reserved=${burstTierAfter.quantity_reserved}`);
  // cleanup burst event
  const burstOrderIds = (await admin.from("orders").select("id").eq("event_id", burstEvent.id)).data?.map((o) => o.id) ?? [];
  if (burstOrderIds.length) await admin.from("payment_intents").delete().in("ref_id", burstOrderIds);
  await admin.from("ticket_tiers").delete().eq("event_id", burstEvent.id);
  await admin.from("orders").delete().eq("event_id", burstEvent.id);
  await admin.from("events").delete().eq("id", burstEvent.id);

  // ── review (needs USED ticket — mo was checked in) ────────────────
  const rev = await api("/reviews", { token: U.u2.token, body: { eventId: paid.id, rating: 5, reviewText: "E2E test review" } });
  report("L1. review by checked-in user", rev.ok === true, JSON.stringify(rev.error ?? rev.data));
  const revBad = await api("/reviews", { token: U.u1.token, body: { eventId: paid.id, rating: 5 } });
  report("L2. review by non-attendee blocked", revBad.ok === false, JSON.stringify(revBad.error ?? ""));
  const revDup = await api("/reviews", { token: U.u2.token, body: { eventId: paid.id, rating: 4 } });
  report("L3. duplicate review → friendly error", revDup.ok === false && /already reviewed/i.test(revDup.error ?? ""), JSON.stringify(revDup.error ?? ""));
  const revRange = await api("/reviews", { token: U.u2.token, body: { eventId: paid.id, rating: 9 } });
  report("L4. rating out of range → 400", revRange.status === 400 && revRange.ok === false);

  // ── M: input validation / envelope ────────────────────────────────
  const badJson = await fetch(`${BASE}/api/v1/checkout`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${U.u1.token}` }, body: "{not json" });
  const badJsonRes = await badJson.json();
  report("M1. invalid JSON → 400 envelope", badJson.status === 400 && badJsonRes.ok === false && typeof badJsonRes.error === "string");
  const badUuid = await api("/orders/manual", { token: U.u1.token, body: { eventId: "not-a-uuid", tierId: freeTier.id, quantity: 1 } });
  report("M2. bad uuid → 400", badUuid.status === 400 && badUuid.ok === false);
  const missingField = await api("/orders/manual", { token: U.u1.token, body: { eventId: free.id } });
  report("M3. missing required field → 400", missingField.status === 400 && missingField.ok === false);
  const negQty = await api("/orders/manual", { token: U.u1.token, body: { eventId: free.id, tierId: freeTier.id, quantity: -3, isFree: true } });
  report("M4. negative quantity rejected", negQty.ok === false, JSON.stringify(negQty.error ?? ""));
  const createAsUser = await api("/events", { token: U.u1.token, body: { title: "x", startsAt: new Date(Date.now() + 864e5).toISOString() } });
  report("M5. non-organizer create event blocked", createAsUser.ok === false, JSON.stringify(createAsUser.error ?? ""));

  // ── N: event create via API ───────────────────────────────────────
  const created = await api("/events", { token: U.org.token, body: {
    title: "DEVTEST API-Created Event", description: "via api", venueName: "V", venueAddress: "A",
    googleMapsLink: "https://maps.google.com/?q=x", startsAt: new Date(Date.now() + 9 * 864e5).toISOString(),
    endsAt: new Date(Date.now() + 9.25 * 864e5).toISOString(), pricingMode: "PAID",
    tiers: [{ name: "GA", pricePaise: 25000, quantity: 10, perks: [] }], isDraft: true,
  } });
  const createdId = created.data?.eventId;
  const createdRow = createdId ? (await admin.from("events").select("status").eq("id", createdId).single()).data : null;
  report("N1. organizer creates draft event via API", created.ok === true && createdRow?.status === "DRAFT", `id=${createdId} status=${createdRow?.status}`);
  const createdNoTitle = await api("/events", { token: U.org.token, body: { isDraft: true } });
  report("N2. create without title → 400", createdNoTitle.status === 400 && createdNoTitle.ok === false);
  if (createdId) {
    await admin.from("ticket_tiers").delete().eq("event_id", createdId);
    await admin.from("events").delete().eq("id", createdId);
  }

  // ── O: money math verification ────────────────────────────────────
  const paidEventFull = (await admin.from("events").select("commission_bps,convenience_fee_bps,commission_enabled,convenience_fee_enabled").eq("id", paid.id).single()).data;
  const moFull = (await admin.from("orders").select("*").eq("id", mo.id).single()).data;
  if (moFull && paidEventFull) {
    const expCommission = Math.round(moFull.subtotal_paise * (paidEventFull.commission_enabled ? paidEventFull.commission_bps : 0) / 10000);
    const expConv = Math.round(moFull.subtotal_paise * (paidEventFull.convenience_fee_enabled ? paidEventFull.convenience_fee_bps : 0) / 10000);
    // Razorpay-era math: buyer total includes the gateway gross-up; payout and
    // platform fee do not double-count the gateway component.
    const mathOk =
      moFull.subtotal_paise === moFull.unit_price_paise * moFull.quantity &&
      moFull.commission_paise === expCommission &&
      moFull.convenience_fee_paise === expConv &&
      moFull.platform_fee_paise === moFull.commission_paise + moFull.convenience_fee_paise &&
      moFull.total_paise === moFull.subtotal_paise + moFull.convenience_fee_paise + (moFull.gateway_fee_paise ?? 0) &&
      moFull.organizer_payout_paise === moFull.subtotal_paise - moFull.commission_paise;
    report("O1. order money math (bps formulas)", mathOk, `subtotal=${moFull.subtotal_paise} comm=${moFull.commission_paise} exp=${expCommission} conv=${moFull.convenience_fee_paise} total=${moFull.total_paise} payout=${moFull.organizer_payout_paise}`);
  } else {
    report("O1. order money math", false, "order/event row missing");
  }

  // ── P: cancel event with confirmed order → refund/void/restore ────
  const { data: cancelEv } = await admin.from("events").insert({
    organizer_id: paid.organizer_id, title: `DEVTEST Cancel ${Date.now()}`, description: "c",
    category: "JAM_GIG", categories: ["JAM_GIG"], city: "KOLKATA", venue_name: "V", venue_address: "",
    google_maps_link: "https://maps.google.com/?q=x", starts_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    ends_at: new Date(Date.now() + 7.25 * 864e5).toISOString(), pricing_mode: "PAID", status: "PUBLISHED",
  }).select("id").single();
  const { data: cancelTier } = await admin.from("ticket_tiers").insert({ event_id: cancelEv.id, name: "GA", price_paise: 50000, quantity: 5, perks: [] }).select("id").single();
  const cOrder = await reserveOrder(U.u2, cancelEv.id, cancelTier.id, { name: "Cancel Victim", phone: "+919000000099" });
  const cOrderRow = (await getOrders(cancelEv.id)).pop();
  if (cOrderRow) await captureOrder(cOrderRow.id);
  const cancelRes = await api(`/events/${cancelEv.id}/cancel`, { token: U.org.token, body: { reason: "E2E cancel test" } });
  const cancelEvAfter = (await admin.from("events").select("status").eq("id", cancelEv.id).single()).data;
  const cOrderAfter = cOrderRow ? (await admin.from("orders").select("status").eq("id", cOrderRow.id).single()).data : null;
  const cTicketAfter = cOrderRow ? (await admin.from("tickets").select("status").eq("order_id", cOrderRow.id).maybeSingle()).data : null;
  const cancelTierAfter = await getTier(cancelTier.id);
  report("P1. cancel → event CANCELLED", cancelRes.ok === true && cancelEvAfter?.status === "CANCELLED", `status=${cancelEvAfter?.status} err=${cancelRes.error ?? ""}`);
  report("P2. cancel → order refunded/cancelled", ["REFUNDED", "CANCELLED"].includes(cOrderAfter?.status), `order=${cOrderAfter?.status}`);
  report("P3. cancel → ticket voided", ["VOID", "CANCELLED"].includes(cTicketAfter?.status), `ticket=${cTicketAfter?.status}`);
  report("P4. cancel → inventory restored", cancelTierAfter.quantity_sold === 0, `sold=${cancelTierAfter.quantity_sold}`);
  // cleanup cancel fixtures
  await admin.from("tickets").delete().eq("event_id", cancelEv.id);
  await admin.from("orders").delete().eq("event_id", cancelEv.id);
  try { await admin.from("payment_ledger").delete().eq("event_id", cancelEv.id); } catch {}
  await admin.from("ticket_tiers").delete().eq("event_id", cancelEv.id);
  await admin.from("events").delete().eq("id", cancelEv.id);

  // ── Q: collab invite → accept ─────────────────────────────────────
  const org2Row = (await admin.from("organizers").select("id").eq("owner_id", U.org2.uid).maybeSingle()).data;
  if (org2Row) {
    const invite = await api("/collab/invite", { token: U.org.token, body: { eventId: paid.id, organizerId: org2Row.id, permissionLevel: "LIMITED" } });
    const collabRow = (await admin.from("event_collaborators").select("*").eq("event_id", paid.id).eq("organizer_id", org2Row.id).maybeSingle()).data;
    report("Q1. collab invite sent", invite.ok === true && !!collabRow, JSON.stringify(invite.error ?? ""));
    const accept = await api("/collab/respond", { token: U.org2.token, body: { eventId: paid.id, collaboratorId: collabRow?.id, accept: true } });
    const collabAfter = (await admin.from("event_collaborators").select("status").eq("id", collabRow?.id).single()).data;
    report("Q2. collab accept → ACTIVE", accept.ok === true && ["ACCEPTED", "ACTIVE"].includes(collabAfter?.status), `status=${collabAfter?.status}`);
    const inviteBad = await api("/collab/invite", { token: U.u1.token, body: { eventId: paid.id, organizerId: org2Row.id } });
    report("Q3. non-owner invite blocked", inviteBad.ok === false, JSON.stringify(inviteBad.error ?? ""));
  } else {
    report("Q1-Q3. second organizer missing", false, "run seed");
  }

  // ── R: clubs ──────────────────────────────────────────────────────
  const club = await api("/communities", { token: U.org.token, body: { name: "DEVTEST E2E Community", bio: "e2e", kind: "COMMUNITY", city: "KOLKATA", membershipType: "OPEN" } });
  const clubId = club.data?.communityId ?? club.data?.clubId;
  report("R1. community created via API", club.ok === true && !!clubId, JSON.stringify(club.error ?? ""));
  if (clubId) {
    const join = await api(`/communities/${clubId}/join`, { token: U.u1.token });
    const memberRow = (await admin.from("community_members").select("id").eq("community_id", clubId).eq("user_id", U.u1.uid).maybeSingle()).data;
    report("R2. user joins open community", join.ok === true && !!memberRow, JSON.stringify(join.error ?? ""));
    const joinAgain = await api(`/communities/${clubId}/join`, { token: U.u1.token });
    const memberCount = (await admin.from("community_members").select("id").eq("community_id", clubId).eq("user_id", U.u1.uid)).data?.length;
    report("R3. rejoin idempotent (1 member row)", joinAgain.ok !== undefined && memberCount === 1, `rows=${memberCount}`);
  }


  // ── T: communities platform ─────────────────────────────────────
  // T1-T3: join modes
  const priv = await api("/communities", { token: U.org.token, body: { name: "DEVTEST Private Community", bio: "e2e", type: "CLUB", membershipType: "PRIVATE" } });
  const privId = priv.data?.communityId;
  report("T1. private community created", !!privId, JSON.stringify(priv.error ?? ""));
  if (privId) {
    const j = await api(`/communities/${privId}/join`, { token: U.u2.token });
    const mj = (await admin.from("community_members").select("id,status").eq("community_id", privId).eq("user_id", U.u2.uid).maybeSingle()).data;
    report("T2. private join is PENDING", j.ok === true && mj?.status === "PENDING", `status=${mj?.status}`);
    if (mj?.id) {
      const appr = await admin.rpc("set_community_membership", { p_actor_id: U.org.uid, p_member_id: mj.id, p_status: "ACCEPTED" });
      const after = (await admin.from("community_members").select("status").eq("id", mj.id).single()).data;
      const cnt = (await admin.from("communities").select("member_count").eq("id", privId).single()).data;
      report("T3. owner approve → ACCEPTED + count bump", !appr.error && after?.status === "ACCEPTED" && cnt?.member_count === 1, `err=${appr.error?.message ?? ""}`);
    }
  }

  // T4-T5: invite-only community — token is a secret in community_invites
  const inv = await api("/communities", { token: U.org.token, body: { name: "DEVTEST Invite Community", bio: "e2e", type: "CLUB", membershipType: "INVITE_ONLY" } });
  const invId = inv.data?.communityId;
  if (invId) {
    const tok = `devtest-secret-${Math.floor(Math.random() * 1e6)}`;
    await admin.from("community_invites").upsert({ community_id: invId, token: tok }, { onConflict: "community_id" });
    const noTok = await api(`/communities/${invId}/join`, { token: U.u1.token });
    const withTok = await api(`/communities/${invId}/join`, { token: U.u1.token, body: { inviteToken: tok } });
    const mrow = (await admin.from("community_members").select("status").eq("community_id", invId).eq("user_id", U.u1.uid).maybeSingle()).data;
    report("T4. invite-only without token rejected", noTok.ok === false, `err=${noTok.error ?? noTok.status}`);
    report("T5. invite-only with token accepted", withTok.ok === true && mrow?.status === "ACCEPTED", `status=${mrow?.status} err=${withTok.error ?? ""}`);
  }

  // T6: tokens never leak through the REST surface
  const leakCheck = await admin.from("events").select("id").eq("id", paid.id).single();
  const anonRes = await fetch(`${SB_URL}/rest/v1/events?select=*&id=eq.${leakCheck.data.id}`, {
    headers: { apikey: ANON, authorization: `Bearer ${ANON}` },
  });
  const anonRow = (await anonRes.json())?.[0] ?? {};
  report("T6. invite_token not in anon select *", !("invite_token" in anonRow), Object.keys(anonRow).filter(k => k.includes("invite")).join(","));

  // T7-T8: community event visibility gates in the booking RPCs
  if (privId) {
    const { data: cev } = await admin.from("events").insert({
      organizer_id: paid.organizer_id, title: "DEVTEST Community Event", description: "e2e",
      things_to_know: [], category: "JAM_GIG", city: "KOLKATA", venue_name: "Test", latitude: 22.57, longitude: 88.36,
      starts_at: new Date(Date.now() + 7 * 864e5).toISOString(), ends_at: new Date(Date.now() + 7.25 * 864e5).toISOString(),
      status: "PUBLISHED", community_id: privId, visibility: "MEMBERS_ONLY",
    }).select("id").single();
    const { data: ctier } = await admin.from("ticket_tiers").insert({
      event_id: cev.id, name: "GA", price_paise: 0, quantity: 10, admits: 1, sort_order: 0,
    }).select("id").single();
    const nonMember = await userClient(U.u1.token).rpc("create_free_order", {
      p_event_id: cev.id, p_tier_id: ctier.id, p_quantity: 1, p_invite_token: null,
      p_buyer_name: "U1", p_buyer_phone: "+919000000001", p_buyer_email: null, p_buyer_gender: null,
    });
    report("T7. MEMBERS_ONLY blocks non-member", !!nonMember.error, `err=${nonMember.error?.message?.slice(0,60)}`);
    // u2 is an ACCEPTED member (T3)
    const member = await userClient(U.u2.token).rpc("create_free_order", {
      p_event_id: cev.id, p_tier_id: ctier.id, p_quantity: 1, p_invite_token: null,
      p_buyer_name: "U2", p_buyer_phone: "+919000000002", p_buyer_email: null, p_buyer_gender: null,
    });
    report("T8. MEMBERS_ONLY admits member", !member.error, `err=${member.error?.message?.slice(0,60)}`);
  }

  // T9: group ticket — admits=3 mints 3 tickets per unit
  {
    const { data: gev } = await admin.from("events").insert({
      organizer_id: paid.organizer_id, title: "DEVTEST Group Event", description: "e2e",
      things_to_know: [], category: "JAM_GIG", city: "KOLKATA", venue_name: "Test", latitude: 22.57, longitude: 88.36,
      starts_at: new Date(Date.now() + 7 * 864e5).toISOString(), ends_at: new Date(Date.now() + 7.25 * 864e5).toISOString(),
      status: "PUBLISHED",
    }).select("id").single();
    const { data: gtier } = await admin.from("ticket_tiers").insert({
      event_id: gev.id, name: "Squad of 3", price_paise: 0, quantity: 5, admits: 3, sort_order: 0,
    }).select("id").single();
    const order = await userClient(U.u1.token).rpc("create_free_order", {
      p_event_id: gev.id, p_tier_id: gtier.id, p_quantity: 1, p_invite_token: null,
      p_buyer_name: "Squad", p_buyer_phone: "+919000000003", p_buyer_email: null, p_buyer_gender: null,
    });
    const oid = order.data?.order_id ?? order.data?.id;
    const tk = oid ? (await admin.from("tickets").select("id").eq("order_id", oid)).data : [];
    report("T9. group tier mints 3 tickets", tk.length === 3, `tickets=${tk.length} err=${order.error?.message?.slice(0,60) ?? ""}`);
  }

  // T10: guestlist — free ticket + shareable link, zero ledger
  {
    const gl = await admin.rpc("create_guestlist_entry", {
      p_actor_id: U.org.uid, p_event_id: paid.id,
      p_name: "Dev Guest", p_phone: "+919000000099", p_email: null,
    });
    const gid = typeof gl.data === "string" ? gl.data : gl.data?.ticket_id;
    const trow = gid ? (await admin.from("tickets").select("status,order_id").eq("id", gid).maybeSingle()).data : null;
    const ledger = trow?.order_id ? (await admin.from("payment_ledger").select("id").eq("order_id", trow.order_id)).data : [];
    report("T10. guestlist ticket valid + no ledger", !!trow && trow.status === "VALID" && ledger.length === 0, `gl=${JSON.stringify(gl.error?.message ?? gl.data)}`);
  }

  // ── S: postponement refund request (free event is POSTPONED) ──────
  const refundReq = await api("/refunds/postponement", { token: U.u1.token, body: { eventId: free.id } });
  const refundErr = refundReq.error ?? "";
  report("S1. postponement refund on free order → handled gracefully", refundReq.status < 500, `ok=${refundReq.ok} err=${refundErr}`);

  // ── summary ───────────────────────────────────────────────────────
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(55)}\n${pass}/${results.length} passed${fail.length ? " — FAILURES:" : " — all green"}`);
  fail.forEach((f) => console.log(`  ❌ ${f.name}: ${f.detail ?? ""}`));
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => { console.error("❌ FATAL", e); process.exit(1); });
