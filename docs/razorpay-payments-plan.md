# Razorpay-Only Payments — Megaplan (approved 2026-09-26)

> Source of truth for the Razorpay phase. Supersedes `docs/reference/razorpay-migration-plan.md`. Execution order + status tracked in §16 and `docs/task.md`.


Replace every manual UPI/UTR flow (tickets, slot boosts, door-staff, club fees; hero boost already done) with a Razorpay-only pipeline built on a unified `payment_intents` router, DB-enforced idempotency and inventory locks, a webhook that is the source of truth (with 5xx retries + reconciliation cron), a durable refund worker (BMS model: ticket price refunded, convenience+gateway fee kept), and dedicated Refunds / Payments / Settlement dashboards for organizers and admins — plus closing the wide-open write grants on money tables found during this audit.

## 0. Locked decisions (from Q&A)

| Topic | Decision |
|---|---|
| Settlement | Platform collects all money; admin settles organizers via NEFT and records it (`payout_records`). RazorpayX automation later. |
| Scope | **All** manual UPI/UTR flows → Razorpay: ticket checkout, slot boosts, door-staff service, club membership fees. Hero boost already Razorpay. Box-office/walk-in stays cash (PIN-gated, no gateway). |
| Refunds | **BookMyShow model.** Buyers cannot self-cancel. Refunds only via: (a) event cancellation → automatic; (b) postponement → buyer opts in (exists); (c) exception → organizer *requests* on an order with reason → admin approves & executes. Refund amount = **ticket price only**; convenience + gateway fee are non-refundable (admin "full refund" override for platform-fault cases). |
| Gateway fee | Buyer pays it, bundled into one "Convenience fee" line with an ⓘ breakdown (platform x% + payment gateway 2.36%). `gateway_fee_bps` is a platform setting (default 236). |
| Webhook | Return **5xx on processing failure** so Razorpay retries; idempotency makes replays safe. |
| Testing | Razorpay **test keys + ngrok tunnel** for real test payments; plus HMAC-signed simulated-webhook suite + DB probes. |

> Approved 2026-09-26. Implementation status: see §16 + `docs/task.md`.

---

## 1. Audit — what exists today and what's wrong

**Already built (reuse):** `create_reserved_order` (tier `FOR UPDATE`, server-side money, one-active-order-per-user), `confirm_razorpay_order` (idempotent, late-capture → auto refund row), `fail_razorpay_order`, `expire_reserved_orders` (+cron, 5 min), `set_razorpay_order_id`, unique indexes on `razorpay_order_id`/`razorpay_payment_id`/`idempotency_key`/`payment_ledger.razorpay_payment_id`, `webhook_events` (unique `razorpay_event_id`), `RazorpayCheckout` client component, `runCheckout`/`runVerifyPayment`/`runPaymentFailure` in `shared/services/orders.ts`, refund/ledger/payout tables, `adminInitiateRefundAction` + `adminRecordPayoutAction` (written but **wired to no UI**), hero-boost Razorpay path.

**Gaps / defects found (all addressed below):**

| # | Finding | Severity |
|---|---|---|
| A1 | `/checkout` UI is still manual UPI (`CheckoutForm` → `submitPaymentAction` → `runManualCheckout` → `create_paid_order`); `RazorpayCheckout` is only used by hero boost. | blocker |
| A2 | **Table grants wide open**: `anon`/`authenticated` hold INSERT/UPDATE/DELETE on `orders`, `tickets`, `refunds`, `ticket_tiers`; RLS `organizer updates orders` / `organizer updates tickets` / `organizers can create|update refunds` have **no column restriction** → an event manager can `UPDATE orders SET status='CONFIRMED', total_paise=1` or mark a refund `COMPLETED` via PostgREST. | **P0 security** |
| A3 | Refund execution is non-atomic Node code: Razorpay call first, DB row after → crash = money moved, no record; retry = double refund. Same pattern in cancel sweep + postponement + admin action. | P0 money |
| A4 | `cancel_event` sets orders `REFUNDED` **before** any money moves; if sweep fails, UI says refunded, buyer has nothing. | P0 money |
| A5 | Webhook always returns 200 → transient failure = lost confirmation until a human looks at `webhook_events`. No amount/currency verification against the order. Ledger insert is best-effort outside the confirm transaction. | P1 |
| A6 | No reconciliation: missed webhook + closed tab = paid buyer with `RESERVED` order that cron **expires** (late capture then auto-refunds — buyer loses the seat they paid for). | P1 |
| A7 | No `gateway_fee` in the money model; `razorpay_fee_paise` always 0 → platform net revenue overstated. | P1 |
| A8 | No refund dashboard (organizer or admin); `adminInitiateRefundAction` unreachable; `refund_status` lacks REQUESTED/REJECTED. | feature |
| A9 | Slot boosts, door-staff, club fees are UTR + admin/owner eyeballing. | feature |
| A10 | `webhook_events` has a duplicate non-unique index; hero-boost fallback is a hard-coded `if` in the webhook — doesn't scale to 5 payable kinds. | hygiene |
| A11 | Two `create_paid_order` overloads still live + PUBLIC execute. `PENDING_VERIFICATION`/`REJECTED` become legacy-only. | cleanup |
| A12 | Organizer UPI ID is required in KYC step 4 solely for checkout QR — obsolete once buyers pay Razorpay. | cleanup |

---

## 2. Target architecture

### 2.1 Money formula (server-authoritative, integer paise)

```
subtotal          = unit_price × qty
commission        = round(subtotal × commission_bps / 10000)           (organizer-side; per-event bps, tiered default)
convenience       = round(subtotal × convenience_fee_bps / 10000)      (platform-side, per-event bps)
gateway_fee       = round((subtotal + convenience) × gateway_bps / (10000 − gateway_bps))   (gross-up so Razorpay's cut is covered)
total (buyer pays)= subtotal + convenience + gateway_fee
organizer_payout  = subtotal − commission                               (fee_payer=ORGANIZER: − convenience too, and buyer total excludes it)
platform_gross    = commission + convenience + gateway_fee
platform_net      = platform_gross − razorpay_fee_actual                (actual from payment entity fee+tax; recorded per payment)
refund_default    = subtotal                                            (ticket price only)
refund_full       = total                                               (admin override, reason required)
```

New column `orders.gateway_fee_paise`. `platform_fee_paise` keeps meaning commission+convenience. Display: one "Convenience fee ⓘ" row = convenience + gateway, tooltip itemises both percentages.

### 2.2 `payment_intents` — one router for every payable thing

```
payment_intents(
  id uuid pk, kind text check in ('TICKET_ORDER','HERO_BOOST','SLOT_BOOST','DOOR_STAFF','CLUB_MEMBERSHIP'),
  ref_id uuid not null,            -- orders.id / hero_boosts.id / boosts.id / door_staff_orders.id / club_members.id
  user_id uuid not null, amount_paise int not null check (>0), currency text default 'INR',
  razorpay_order_id text unique, razorpay_payment_id text unique,
  status text check in ('CREATED','PAID','FAILED','EXPIRED','MISMATCH') default 'CREATED',
  razorpay_fee_paise int, razorpay_tax_paise int, payment_method text,
  idempotency_key text unique, expires_at timestamptz not null, paid_at timestamptz, created_at, updated_at
)
unique (kind, ref_id) where status in ('CREATED','PAID')
```
Webhook resolves `razorpay_order_id → intent → kind` and calls one dispatcher RPC. `orders.razorpay_order_id` stays populated for compatibility.

### 2.3 State machines

**Order** (paid, online): `RESERVED ──payment.captured/verify──▶ CONFIRMED` · `RESERVED ──payment.failed/dismiss──▶ FAILED` · `RESERVED ──TTL cron──▶ EXPIRED` · `RESERVED ──cancel_event──▶ CANCELLED` · `CONFIRMED ──refund created──▶ REFUND_REQUESTED ──refund COMPLETED──▶ REFUNDED` · `REFUND_REQUESTED ──admin rejects──▶ CONFIRMED` · dead order + late capture → `REFUND_REQUESTED` + auto refund row (exists). `PENDING_VERIFICATION`/`REJECTED`: legacy rows only; no code path creates them.

**Refund**: `REQUESTED ──admin approve──▶ PENDING ──worker claims──▶ INITIATING ──Razorpay accepted──▶ INITIATED ──refund.processed──▶ COMPLETED` · `INITIATING/INITIATED ──refund.failed / API error──▶ FAILED ──admin retry──▶ PENDING` · `REQUESTED ──admin reject──▶ REJECTED`. Auto flows (cancel, postponement, late capture) insert directly as `PENDING`. Legacy manual-UPI orders (no `razorpay_payment_id`) can only be `MANUAL_SETTLED` by admin with a reference (audited).

**Payment intent**: `CREATED → PAID | FAILED | EXPIRED | MISMATCH` (amount/currency ≠ expected → never confirms, alerts admin).

### 2.4 Invariants (enforced in DB)
- `ticket_tiers`: `CHECK (quantity_sold + quantity_reserved <= quantity)` and both `>= 0`.
- A user has ≤1 order in (`RESERVED`,`CONFIRMED`,`REFUND_REQUESTED`) per event.
- Σ `refunds.amount_paise` (status ∉ REJECTED/FAILED) per order ≤ `orders.total_paise` (trigger).
- One `payment_ledger` row per `razorpay_payment_id` / per `refund_<id>` (unique index exists; inserts use `ON CONFLICT DO NOTHING` inside the RPC transaction).

---

## 3. Idempotency & concurrency — mechanism by layer

| Threat | Mechanism |
|---|---|
| Double-click / retry creates 2 reservations | Client generates `idempotency_key` (uuid, sessionStorage per checkout page); `create_reserved_order(p_idempotency_key)` returns the existing RESERVED order + its Razorpay order id if key seen (unique index exists). Plus one-active-order-per-user-per-event rule. |
| 2+ buyers, last ticket | Tier row `SELECT … FOR UPDATE` in `create_reserved_order`; availability = `quantity − sold − reserved`; CHECK constraint as hard floor. Burst-tested (10 buyers × qty-3). |
| Verify callback + webhook both confirm | `confirm_razorpay_order` locks order `FOR UPDATE`, early-returns tickets if already CONFIRMED; `razorpay_payment_id` unique. |
| Razorpay replays webhook | `webhook_events.razorpay_event_id` unique; `INSERT … ON CONFLICT DO NOTHING RETURNING` decides new vs seen; a `processing_started_at` claim prevents two concurrent deliveries of the same id both processing. |
| Same payment id on two orders | unique `orders.razorpay_payment_id` + `payment_intents.razorpay_payment_id`. |
| Wrong amount captured | Dispatcher compares `payment.amount`/`currency` with intent → `MISMATCH`, no confirmation, `notifyAdmins(PAYMENT_ALERT)`. |
| Refund executed twice (crash between Razorpay call and DB write) | Refund row created **first** (PENDING); worker claims it (`FOR UPDATE SKIP LOCKED` → INITIATING with `claimed_at`); Razorpay call passes `receipt = refund.id`; before calling, worker lists refunds on the payment (`payments.fetchMultipleRefund`) and adopts any with matching receipt instead of creating a new one. Stale INITIATING (>10 min) is re-claimed the same way. |
| Over-refund | Trigger: Σ active refunds ≤ order total; amount default = subtotal. |
| Concurrent refund workers | `SKIP LOCKED` claim; INITIATING state. |
| Cron overlap | All crons are RPC-driven with row locks; GH Actions runs are sequential per schedule. |
| Ledger double-write | Ledger inserts moved **inside** the confirming/refunding RPC transactions with `ON CONFLICT DO NOTHING`. |
| Missed webhook + closed tab | Reconciliation cron (§5.4) fetches Razorpay payments for RESERVED-past-TTL intents **before** expiring them; captured → confirm. |

---

## 4. Database migrations (each appended to `fix_all.sql` + `schema.sql`, applied live via `pg`)

**STEP 32 — Security lockdown (P0, first)**
- `revoke insert, update, delete on orders, tickets, refunds, payment_ledger, payout_records, webhook_events from anon, authenticated;` grant to `service_role`.
- `ticket_tiers`: revoke table-level UPDATE from authenticated, then `grant update (name, price_paise, quantity, perks, sort_order, tier_type, phase_order, phase_opens_at, phase_closes_at) on ticket_tiers to authenticated` (organizer edits keep working; `quantity_sold`/`quantity_reserved` RPC-only). Add the CHECK constraint.
- Drop policies: `organizer updates orders`, `organizer updates tickets`, `organizer creates tickets`, `organizers can create refunds`, `organizers can update refund status`, `admins insert refunds`. Keep SELECT policies.
- Drop both `create_paid_order` overloads. Revoke PUBLIC on `create_reserved_order`, `cancel_event`, `request_postponement_refund`; grant `authenticated` only.
- Verify with anon/organizer probes (expect 401/permission denied).

**STEP 33 — Money model + intents**
- `orders` add `gateway_fee_paise int default 0`, `order_source` values doc'd (`ONLINE`,`WALKIN`,`BOX_OFFICE`,`MANUAL_UPI` legacy); backfill `order_source='MANUAL_UPI'` where `razorpay_order_id is null and status in ('CONFIRMED','PENDING_VERIFICATION','REJECTED') and not is_box_office`.
- `platform_settings`: `gateway_fee_bps=236`, `reservation_ttl_minutes=15`, `refund_fees_on_cancellation=false`.
- `payment_intents` table (§2.2) + RLS (owner SELECT, admin SELECT, service-only writes).
- `create_reserved_order` v2: add `p_idempotency_key`; compute `gateway_fee` per §2.1; TTL from setting; also insert `payment_intents(kind='TICKET_ORDER')`; return order + intent id.
- `create_payment_intent(p_kind, p_ref_id, p_amount_paise, p_idempotency_key)` for HERO_BOOST/SLOT_BOOST/DOOR_STAFF/CLUB_MEMBERSHIP — validates ownership + amount server-side per kind (boost slot price from `boost_slot_prices`, door-staff from `door_staff_pricing` settings, club fee from `clubs.membership_fee_paise`, hero from setting).
- `attach_razorpay_order(p_intent_id, p_razorpay_order_id)` (replaces `set_razorpay_order_id`, also writes `orders.razorpay_order_id` for TICKET_ORDER).

**STEP 34 — Capture/fail dispatcher + atomic ledger**
- `apply_captured_payment(p_razorpay_order_id, p_razorpay_payment_id, p_amount, p_currency, p_method, p_fee, p_tax, p_signature)`: lock intent; if PAID → return (idempotent); amount/currency check → MISMATCH path; else switch(kind): TICKET_ORDER → inline `confirm_razorpay_order` logic + ledger `TICKET_SALE` (with `razorpay_fee_paise`); HERO_BOOST → activate (existing `activateHeroBoost` logic ported to SQL) + `BOOST_SALE` ledger; SLOT_BOOST → `boosts.status='ACTIVE'`, `reviewed_at=now()` + ledger; DOOR_STAFF → `payment_status='PAID'` + ledger `DOOR_STAFF_SALE`; CLUB_MEMBERSHIP → `club_members.status='ACCEPTED'` (payment ⇒ acceptance; owner approval step removed for paid clubs) + ledger `CLUB_FEE`. Sets intent PAID. Notifications inside txn.
- `apply_failed_payment(p_razorpay_order_id)`: TICKET_ORDER → `fail_razorpay_order`; others → intent FAILED (ref stays pending/retryable).
- `expire_payment_intents()`: TTL-expired CREATED intents → EXPIRED (+ `expire_reserved_orders` semantics for TICKET_ORDER). Called by cron **after** reconciliation.
- `record_webhook_event(p_event_id, p_type, p_payload) returns (is_new bool, already_processed bool)` — ON CONFLICT logic + processing claim; `finish_webhook_event(p_event_id, p_ok, p_error)`.

**STEP 35 — Refund pipeline**
- `refund_status` enum add `REQUESTED`, `INITIATING`, `REJECTED`, `MANUAL_SETTLED`. `refunds` add `refund_scope text check in ('TICKET_PRICE','FULL','CUSTOM')`, `requested_by uuid`, `approved_by uuid`, `approved_at`, `rejected_reason text`, `claimed_at timestamptz`, `attempts int default 0`, `last_error text`, `receipt text unique default gen_random_uuid()::text`.
- Trigger `refunds_no_overrefund` (Σ ≤ total).
- `request_refund(p_order_id, p_reason)` — caller must be event manager (or admin); order CONFIRMED; no active refund; inserts REQUESTED with `amount = subtotal`; `notifyAdmins(REFUND_REQUESTED)`.
- `approve_refund(p_refund_id, p_scope, p_custom_amount, p_note)` — admin; REQUESTED→PENDING; sets amount per scope; order → REFUND_REQUESTED; tickets → CANCELLED only when scope ∈ (TICKET_PRICE, FULL) i.e. whole-order refund; releases `quantity_sold`; `offer_waitlist_next`; notify buyer + organizer.
- `reject_refund(p_refund_id, p_reason)` — admin; REQUESTED→REJECTED; notify organizer.
- `claim_pending_refunds(p_limit) returns setof refunds` — service; `PENDING` or (`INITIATING` and `claimed_at < now()-10min`) `FOR UPDATE SKIP LOCKED` → INITIATING, attempts+1.
- `complete_refund_initiation(p_refund_id, p_razorpay_refund_id, p_ok, p_error)` — service; → INITIATED (+ ledger `REFUND` row `ON CONFLICT DO NOTHING`, key `refund_<rzp_id>`) or FAILED after 5 attempts (else back to PENDING with backoff via `claimed_at`).
- `finalize_refund(p_razorpay_refund_id, p_status)` — service (webhook); COMPLETED → order `REFUNDED` (if whole-order) + notify buyer `REFUND_COMPLETED`; FAILED → FAILED + `notifyAdmins`.
- `cancel_event` v2: orders → `REFUND_REQUESTED` (not REFUNDED); refund rows PENDING with amount = subtotal (or total if `refund_fees_on_cancellation`); tickets CANCELLED immediately; organizer liability ADJUSTMENT written **inside** the RPC (moves out of Node sweep). Node sweep removed — worker does the money.
- `request_postponement_refund` v2: amount = subtotal; row PENDING; no Node Razorpay call (worker).
- `admin_manual_settle_refund(p_refund_id, p_reference)` for legacy `MANUAL_UPI` orders → MANUAL_SETTLED + audit.

**STEP 36 — Settlement & notifications**
- View `organizer_settlement_v` (service/admin/owner-select): per organizer `gross_sales`, `commission`, `refund_adjustments`, `payout_due = Σnet_organizer(TICKET_SALE) + Σnet_organizer(ADJUSTMENT) − Σ(PAYOUT)`, `paid_out`, `last_payout_at` from `payment_ledger`. Per-event variant.
- `event_notification_type` add `REFUND_REQUESTED`, `REFUND_APPROVED`, `REFUND_REJECTED`, `PAYMENT_ALERT`, `PAYOUT_RECORDED`.
- `payment_ledger.type` doc'd set: `TICKET_SALE, REFUND, ADJUSTMENT, PAYOUT, BOOST_SALE, DOOR_STAFF_SALE, CLUB_FEE`.
- Drop duplicate index `webhook_events_razorpay_event_idx`; add `webhook_events.processing_started_at`.

`database.types.ts` updated for every table/RPC above.

---

## 5. Server changes

### 5.1 `shared/lib/pricing.ts`
`calculatePrice(..., feeConfig & { gatewayFeeBps })` → adds `gatewayFeePaise`, `buyerFeePaise = convenience + gateway`, `refundableAmountPaise = subtotal`. Display helper `describeFees()` for the tooltip. Pure; unit-tested for rounding + gross-up (assert `total × gbps/10000 ≈ gateway_fee` within 1 paisa).

### 5.2 `shared/services/payments.ts` (new; `orders.ts` slimmed)
- `startPayment(user, {kind, ...})` → `create_reserved_order`/`create_payment_intent` → `razorpay.orders.create({amount, currency, receipt: intent.id, payment_capture: 1, notes:{intent_id, kind, ref_id}})` → `attach_razorpay_order` → `CheckoutSession` (adds `intentId`, `expiresAt`). On Razorpay error → `apply_failed_payment`. Reuses existing idempotency key if provided.
- `verifyPayment(user, {razorpayOrderId, paymentId, signature})` → HMAC check (exists) → ownership via intent → `apply_captured_payment(... p_amount=null → skip amount check? NO:` fetch `razorpay.payments.fetch(paymentId)` to get amount/method/fee/tax, then dispatch). Fast path for UX; webhook is authoritative.
- `reportPaymentFailure` → `apply_failed_payment`.
- `getPaymentStatus(user, intentId)` → for `/checkout/status` polling.
- Remove: `runManualCheckout` paid branch (free RSVP stays), `createOrder` (manual), `runCancellationRefundSweep`, Razorpay calls inside `runPostponementRefund`.

### 5.3 Webhook `app/api/razorpay/webhook/route.ts` (rewrite)
1. raw body → HMAC verify (401 on fail).
2. `record_webhook_event` → seen&processed → 200 `already_processed`; being processed by another delivery → 200 `in_progress`.
3. Switch: `payment.captured`/`order.paid` → `apply_captured_payment` (amount, currency, method, fee, tax from entity); `payment.failed` → `apply_failed_payment`; `payment.authorized` → log only (auto-capture on); `refund.created`/`refund.processed`/`refund.failed`/`refund.speed_changed` → `finalize_refund`; `payment.dispute.created|won|lost` → insert `payment_disputes` (small table: payment_id, amount, status, raw) + `notifyAdmins(PAYMENT_ALERT)`; unknown → log.
4. Success → `finish_webhook_event(ok)` → 200. Exception → `finish_webhook_event(fail, err)` → **500** (Razorpay retries with backoff ≤24h). Signature/parse errors stay 4xx (no retry).
5. Structured `logger` fields: event id, type, intent kind, ref id, outcome.

### 5.4 Cron endpoints (all `CRON_SECRET` bearer, existing pattern)
- `/api/cron/process-refunds` (every 2 min): `claim_pending_refunds(20)` → for each: fetch payment refunds, adopt by receipt or `payments.refund(paymentId, {amount, receipt, notes, speed:'normal'})` → `complete_refund_initiation`. Skips with clean JSON when Razorpay not configured (like drain-notifications).
- `/api/cron/reconcile-payments` (every 10 min): (a) `payment_intents` CREATED past `expires_at` with `razorpay_order_id` → `razorpay.orders.fetchPayments(id)`; captured → `apply_captured_payment` else `expire_payment_intents`; (b) INITIATED refunds > 1h → `razorpay.refunds.fetch` → `finalize_refund`; (c) `webhook_events` unprocessed > 10 min → re-dispatch payload; (d) summary → `notifyAdmins(PAYMENT_ALERT)` only when anomalies (MISMATCH intents, FAILED refunds, disputes) exist.
- `/api/cron/expire-reservations` → now calls `expire_payment_intents()` (superset); GH Actions job kept, scheduled **after** reconcile in the same 5-min job.
- `cron.yml`: add the two jobs + secrets note.

### 5.5 Notifications
`notifyAdmins` for REFUND_REQUESTED / PAYMENT_ALERT; buyer: `ORDER_CONFIRMED` (RPC), `REFUND_INITIATED`, `REFUND_COMPLETED`; organizer: `REFUND_APPROVED`/`REFUND_REJECTED`, `PAYOUT_RECORDED`. Bell labels/colors added.

---

## 6. Buyer-facing client

- `app/checkout/page.tsx`: remove UPI QR aside + "Secure manual payment" copy; fee card shows Ticket / Convenience fee ⓘ (platform x% + gateway 2.36%) / Total; note "Convenience fee is non-refundable".
- `web/components/checkout/checkout-form.tsx`: paid path → `createCheckoutAction(formData + idempotencyKey)` → render `RazorpayCheckout` with `verifyPaymentAction`/`handlePaymentFailureAction`, `successRedirect=/checkout/status?intent=…`. Free path unchanged. Delete UPI copy/WhatsApp/UTR blocks + `upi-qr-code.tsx`.
- New `app/checkout/status/page.tsx` + client poller: shows "Confirming payment…" and subscribes to `orders` realtime (already in publication) + polls `getPaymentStatusAction` every 3s up to 2 min → CONFIRMED → `/tickets?success=1`; FAILED/EXPIRED → retry CTA; still pending after 2 min → "We're confirming with the bank — you'll get a notification; no double charge will occur" (webhook/reconcile will land it).
- `RazorpayCheckout`: pass `notes`, `timeout` (TTL seconds) to Checkout.js; `retry: {enabled:false}` so a retried payment can't outlive the reservation; forward `payment_method` from response when available.
- `/tickets`: order card shows refund status timeline (Requested → Approved → Initiated → Completed) + "Convenience fee non-refundable" note; `PostponementRefundButton` copy → "refund of ticket price ₹X".
- Event page CTA copy: "Pay securely via UPI / cards / netbanking".

---

## 7. Organizer

- `/organizer` tab "Verify payments" → **"Payments"**: read-only realtime order list (RESERVED/CONFIRMED/FAILED/EXPIRED/REFUND_REQUESTED/REFUNDED), payment method, invoice no., Razorpay ids (last 6), filters, CSV export. `order-monitor.tsx` loses approve/reject; `verification-queue.tsx`, `actions/order-verify.ts` deleted. Legacy `PENDING_VERIFICATION` rows (none live) render as "Legacy" with admin-only handling.
- **`/organizer/refunds`** (new): per-event tabs with counts; table of refunds (buyer, amount, scope, status timeline, requested-by, admin note); "Request refund" on a CONFIRMED order (reason ≥10 chars) → `request_refund`; bulk request per event (creates N REQUESTED rows) with confirm-preview. Status realtime via `refunds` publication (add table to `supabase_realtime`).
- **Settlement card** on `/organizer` + `/organizer/settlement` page: gross sales, commission, refund adjustments, **payout due**, payouts received (`payout_records`), downloadable statement; source `organizer_settlement_v`.
- Slot boost (`boost-panel.tsx`): replace UTR step with `RazorpayCheckout` (kind SLOT_BOOST); status ACTIVE on capture; `actions/boosts.ts` `requestBoostAction` → `startPayment`. Admin "approve boost" disappears for Razorpay boosts (kept for legacy rows).
- Door staff (`door-staff-payment.tsx`): `RazorpayCheckout` (kind DOOR_STAFF); `payment_status` PAID on capture; `verifyDoorStaffPaymentAction` removed.
- KYC wizard: UPI ID becomes optional (bank account is the payout rail); copy updated.
- Event form: fee preview shows the buyer's convenience+gateway breakdown and "organizer receives" per ticket.

---

## 8. Admin

- **`/admin/refunds`** (new, + loading skeleton): tabs REQUESTED (n) / PENDING / INITIATING / INITIATED / COMPLETED / FAILED / REJECTED / MANUAL; row: order, buyer, event, organizer, amounts (ticket / fees / requested), Razorpay payment+refund ids, attempts/last error, timeline; actions with **confirm-preview** (same pattern as KYC modal, shows acting admin email + notification text): Approve (scope TICKET_PRICE default / FULL / CUSTOM amount + note), Reject (reason), Retry failed, Manual-settle (legacy orders, reference required). Direct "Initiate refund" from `/admin/orders` creates REQUESTED+PENDING in one step (admin-originated). All audited via `auditFinancialAction`.
- **`/admin/payments`** upgrade: stats (intents by status, MISMATCH, disputes, unprocessed webhooks, stale reservations); tables for MISMATCH intents + disputes; buttons "Replay webhook" (re-dispatch stored payload) and "Run reconciliation now" (calls the cron handler in-process).
- **`/admin/payouts`** upgrade → **Settlements**: per-organizer table from `organizer_settlement_v` (due, paid, last payout, bank details from `organizers` for admins), "Record payout" form wired to `adminRecordPayoutAction` (amount ≤ due guard, NEFT ref, event optional) with preview; per-organizer statement view + CSV. `PAYOUT_RECORDED` notification to organizer.
- `/admin/orders`: remove approve/reject/`bulk-approve-panel`; add payment/refund columns and "Initiate refund".
- `/admin/settings`: `gateway_fee_bps`, `reservation_ttl_minutes`, `refund_fees_on_cancellation`.
- `/admin/boosts`, `/admin/door-staff`, clubs admin: show Razorpay payment state; UTR verify actions kept only for legacy rows.

---

## 9. Clubs (paid membership)
`join-club-form.tsx` + `actions/clubs.ts`: paid club → `startPayment(kind CLUB_MEMBERSHIP)` → `RazorpayCheckout`; capture → `club_members.status='ACCEPTED'` (owner approval step retained **only** for free clubs). UTR field removed. Refund for club fees: admin-only via `/admin/refunds` (intent-based, `refunds.order_id` nullable → add `intent_id` FK to `refunds` so non-order refunds work; `refunds_no_overrefund` uses intent amount when `order_id` is null).

---

## 10. API v1 (mobile parity) + OpenAPI
- Keep `POST /checkout`, `POST /payments/verify`, `POST /payments/failure`; add `GET /payments/intents/[id]` (status poll), `POST /payments/intents` (kind-based start for boosts/door-staff/clubs), `POST /refunds/request` (organizer), `GET /refunds` (organizer/self), `GET /organizer/settlement`. Remove `POST /orders/manual` (410 with message) and boosts/door-staff UTR payloads. `api-client.ts` + `openapi.json` + `docs/reference/api-spec.md` updated.

---

## 11. Removal checklist (manual UPI)
`checkout-form.tsx` UPI/UTR/WhatsApp blocks · `upi-qr-code.tsx` · `submitPaymentAction` paid branch · `runManualCheckout` paid branch · `data/orders.ts createOrder` · `create_paid_order` ×2 (SQL) · `order-monitor` approve/reject · `verification-queue.tsx` · `actions/order-verify.ts` · `bulk-approve-panel.tsx` · `adminApproveOrderAction`/`adminRejectOrderAction` · `approve_order`/`reject_order` RPCs (keep, revoke to service_role; used only for legacy MANUAL_UPI rows via admin) · `boost-panel` UTR · `door-staff-payment` UTR + `verifyDoorStaffPaymentAction` · `join-club-form` UTR · `/api/v1/orders/manual` · `runCancellationRefundSweep` · Razorpay calls inside `runPostponementRefund` · checkout copy "organizer will verify". `utr_reference` columns stay (legacy data), never written.

---

## 12. Testing plan

**Unit (vitest, new `tests/payments-*.test.ts`)**: pricing gross-up + rounding across ₹1–₹50,000 and bps combos; refund split (TICKET_PRICE/FULL/CUSTOM); state-machine transition table (pure fn mirrored from SQL); webhook signature; `describeFees` text.

**DB probes (`scripts/_test_payments.mjs`, live DB, self-cleaning, mirrors `_test_analytics_rollup.mjs` style)**:
1. Reservation burst: 10 concurrent `create_reserved_order` on qty-3 tier → exactly 3 RESERVED, 7 "Not enough tickets"; CHECK constraint never violated.
2. Idempotency key replay → same order id, same razorpay_order_id.
3. `apply_captured_payment` ×2 same payment → one confirmation, tickets count = qty, one ledger row, `razorpay_fee_paise` stored.
4. Amount mismatch → intent MISMATCH, order still RESERVED, admin notification row.
5. Late capture on EXPIRED → REFUND_REQUESTED + PENDING refund (amount = subtotal).
6. Refund pipeline: `request_refund` (organizer) → admin `approve_refund` → `claim_pending_refunds` ×2 concurrent → only one row claimed → `complete_refund_initiation` → `finalize_refund(COMPLETED)` → order REFUNDED, tickets CANCELLED, seat released, ledger REFUND once.
7. Over-refund trigger rejects; reject path restores CONFIRMED.
8. `cancel_event` v2 → orders REFUND_REQUESTED (not REFUNDED), refunds PENDING, ADJUSTMENT row present.
9. RLS/grant lockdown: organizer JWT direct `UPDATE orders/refunds/tickets/ticket_tiers.quantity_sold` → denied; anon RPC execute on money RPCs → denied.
10. Kind dispatch: HERO_BOOST/SLOT_BOOST/DOOR_STAFF/CLUB_MEMBERSHIP intents captured → correct ref state + ledger type.

**Simulated webhooks (`scripts/_test_webhooks.mjs` against `next start` on :3124)**: HMAC-signed payloads for every handled event; duplicate event id → `already_processed`; bad signature → 401; missing type → 400; forced DB failure (invalid payload shape) → 500 + `webhook_events.processed=false`; `refund.processed` arriving before our INITIATED write → finalize by `razorpay_refund_id` still lands; replay endpoint re-processes.

**Live Razorpay test mode (ngrok)**: you provide `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` (rzp_test_) + `NEXT_PUBLIC_RAZORPAY_KEY_ID`; I start `next start -p 3124` behind `ngrok http 3124`, register `<tunnel>/api/razorpay/webhook` in the Razorpay test dashboard with events: payment.authorized, payment.captured, payment.failed, order.paid, refund.created, refund.processed, refund.failed, payment.dispute.*. Scenarios: UPI success (test VPA `success@razorpay`), failure (`failure@razorpay`), modal dismiss, **close tab after paying** (webhook-only confirm + `/checkout/status` lands), card success, admin refund → `refund.processed` → buyer notification, slot boost / door-staff / club payment, reconcile cron with webhook URL temporarily broken then restored.

**Regression**: `scripts/_e2e_dev_test.mjs` updated (manual-UPI steps replaced; 72 → adjusted count green), `_test_analytics_rollup.mjs` 21/21, vitest 113+ green, `tsc`, `next lint`, `next build`.

**Docs**: `docs/reference/test-scenarios.md` — rewrite §Payments, §Refunds, add §Settlement, §Admin Refunds, §Webhook resilience; checklist ranges updated.

---

## 13. Rollout & go-live checklist
1. Apply STEP 32 live first (security) → probes green.
2. STEP 33–36 live; backfill `order_source`; `refresh_analytics_rollups(p_full)` after money-column changes; add `refunds`, `payment_intents` to `supabase_realtime`.
3. Env (local `.env` now, Vercel later): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`; `.env.example` + `health` route report `razorpayConfigured`.
4. Razorpay dashboard: webhook URL + secret + event list; auto-capture default on orders (we also pass `payment_capture:1`); refund speed normal; test → live key swap only after live staging run.
5. GH Actions: `process-refunds` (*/2), `reconcile-payments` (*/10); confirm repo secrets `CRON_SECRET`, `APP_URL`.
6. Enable Supabase PITR before first live payment (architecture §6b trigger).
7. `docs/architecture.md` (§ payments: intents, webhook, worker, reconcile), `docs/memory.md` (gotchas: 5xx semantics, receipt-based refund idempotency, never write money tables from user ctx), `docs/task.md` (Phase 2b Razorpay rows; Phase 3 "refund fee-bearer" marked superseded by BMS model), `docs/prd.md` row updates, `docs/rules.md` §money (RPC-only writes).

---

## 14. Risks & mitigations
- **Gateway fee under-recovery**: Razorpay fee varies by method (UPI/cards/netbanking, intl cards higher). Gross-up at 2.36% covers domestic; actual fee recorded → `/admin/revenue` shows variance; setting is adjustable.
- **Razorpay refund idempotency** relies on `receipt` lookup, not a hard server guarantee → worker lists existing refunds before creating; INITIATING claim window 10 min; alerts on attempts ≥3.
- **5xx retries** could pile up if DB is down — bounded by Razorpay's 24h backoff; idempotent; admin page shows backlog.
- **Legacy CONFIRMED manual orders (43)**: no `razorpay_payment_id` → refunds only via MANUAL_SETTLED; analytics unaffected.
- **Auto-acceptance for paid clubs** changes club-owner control; acceptable since payment implies intent; owners can still remove members.
- **Checkout.js timeout vs TTL**: we set Checkout `timeout` = remaining TTL−30s so a late payment attempt is blocked client-side; server still handles late capture.
- **Realtime dependency** on `/checkout/status`: polling fallback covers dropped sockets.

---

## 15. File map (create / modify / delete)

**SQL**: `supabase/migrations/_step32.sql … _step36.sql` (+ appended to `fix_all.sql`, `schema.sql`).
**Shared**: `lib/pricing.ts` (M), `lib/razorpay.ts` (M: fetch helpers, `payment_capture`), `services/payments.ts` (C), `services/orders.ts` (M: slim), `data/orders.ts` (M), `data/payments.ts` (C: intents, refunds, settlement queries), `data/refunds.ts` (C), `notifications.ts` (M types), `db/database.types.ts` (M), `ui/payment/razorpay-checkout.tsx` (M), `ui/layout/notification-bell.tsx` (M labels), `server.ts`/`index.ts` exports.
**Web**: `app/checkout/page.tsx` (M), `app/checkout/status/page.tsx` (C), `web/components/checkout/checkout-form.tsx` (M), `web/components/checkout/upi-qr-code.tsx` (D), `web/components/checkout/payment-status.tsx` (C), `web/actions/orders.ts` (M), `web/components/tickets/*` (M refund timeline), `web/components/join-club-form.tsx` (M).
**Organizer**: `app/organizer/page.tsx` (M tabs), `app/organizer/refunds/page.tsx` (C), `app/organizer/settlement/page.tsx` (C), `organizer/components/order-monitor.tsx` (M), `verification-queue.tsx` (D), `actions/order-verify.ts` (D), `actions/refunds.ts` (C), `components/refund-request-panel.tsx` (C), `components/settlement-card.tsx` (C), `boost-panel.tsx` (M), `door-staff-payment.tsx` (M), `actions/boosts.ts`/`door-staff.ts` (M), `become-organizer-form.tsx` (M UPI optional), `event-form.tsx` (M fee preview).
**Admin**: `app/admin/refunds/page.tsx` + `loading.tsx` (C), `app/admin/payments/page.tsx` (M), `app/admin/payouts/page.tsx` (M → settlements), `app/admin/orders/page.tsx` (M), `app/admin/settings` (M), `admin/actions/refunds.ts` (C), `admin/actions/admin.ts` (M: remove approve/reject, keep payout), `admin/components/refund-review-table.tsx` (C), `settlement-table.tsx` (C), `bulk-approve-panel.tsx` (D), `admin/data/refunds.ts` (C).
**API**: `app/api/razorpay/webhook/route.ts` (rewrite), `app/api/cron/process-refunds/route.ts` (C), `app/api/cron/reconcile-payments/route.ts` (C), `app/api/cron/expire-reservations/route.ts` (M), `app/api/v1/payments/intents/*` (C), `app/api/v1/refunds/*` (C/M), `app/api/v1/orders/manual/route.ts` (→410), `app/api/openapi.json/route.ts` (M), `shared/api/client.ts` (M), `app/api/health/route.ts` (M).
**Ops/docs/tests**: `.github/workflows/cron.yml`, `.env.example`, `tests/payments-pricing.test.ts`, `tests/payments-state.test.ts`, `scripts/_test_payments.mjs`, `scripts/_test_webhooks.mjs`, `scripts/_e2e_dev_test.mjs` (M), `docs/razorpay-payments-plan.md` (this plan), `docs/architecture.md`, `docs/memory.md`, `docs/task.md`, `docs/prd.md`, `docs/rules.md`, `docs/reference/test-scenarios.md`, `docs/reference/api-spec.md`.

---

## 16. Execution order (one green commit-ready checkpoint each; never push)
1. **P0 Lockdown** — STEP 32 + probes.
2. **Money & intents** — STEP 33 + `pricing.ts` + types + unit tests.
3. **Dispatcher & webhook** — STEP 34 + webhook rewrite + `services/payments.ts` + simulated-webhook suite.
4. **Refund pipeline** — STEP 35 + worker cron + reconcile cron + DB probes 5–8.
5. **Buyer checkout swap** — checkout UI, status page, remove manual; e2e script update.
6. **Organizer** — Payments tab, `/organizer/refunds`, settlement, boosts/door-staff/clubs → Razorpay.
7. **Admin** — `/admin/refunds`, payments/settlements upgrades, settings.
8. **API v1 + docs + STEP 36 settlement view/notifications**.
9. **Live ngrok run** with your test keys; fix; final `tsc`/lint/build/vitest/e2e; docs & test-scenarios finalized.

Acceptance: every scenario in §12 green; no code path can create a paid order without a Razorpay intent; no user-context write can touch `orders`/`tickets`/`refunds`/`payment_ledger`/`payout_records`; replaying any webhook or cron N times changes nothing after the first; a paid buyer with a closed tab always ends CONFIRMED (never EXPIRED) once the webhook or reconcile lands; refund money moves exactly once per approved refund.
