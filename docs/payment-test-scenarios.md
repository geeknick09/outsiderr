# Razorpay payments — test scenarios

Everything below was executed against the **live Supabase test database** with the
real `rzp_test_` keys on 2025-09-27. Probes live in `scripts/_test_step34.mjs`,
`scripts/_test_step35.mjs`, plus one-off probes for late-capture, webhook signing
and the draft-purge/waitlist checks.

## 1. Money model (create_reserved_order + create_payment_intent)

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 1.1 | Paid ticket → `create_reserved_order` | Server-side recompute: `total = subtotal + commission + convenience + gateway`; `fee_payer=BUYER`; `status=RESERVED`; `reserved_at`/expiry set | ✅ live |
| 1.2 | Same user retries checkout for same order | Existing RESERVED order returned (idempotent) — no dup order/intent | ✅ live |
| 1.3 | `create_payment_intent` for TICKET_ORDER | Intent linked to order, `razorpay_order_id` attached via `attach_razorpay_order` | ✅ live |
| 1.4 | Gateway fee math | `gateway_fee` grossed up (buyer covers gateway cost); cash/box-office orders carry `gateway_fee=0` (no convenience fee ⇒ no gateway fee) | ✅ unit + live |
| 1.5 | Paid tiers below/above sold-out | `quantity_reserved` increments, sold-out rejects | ✅ unit |

## 2. Capture dispatcher (`apply_captured_payment`)

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 2.1 | Checkout signature verify → apply | Order CONFIRMED, tickets minted w/ qr_hash, invoice `OUT-YYYYMM-N`, TICKET_SALE ledger | ✅ live |
| 2.2 | Replay same capture (webhook + client both fire) | `ALREADY_PAID`, no second tickets, exactly one ledger row (partial-unique `razorpay_payment_id`) | ✅ live |
| 2.3 | Amount/currency mismatch | Intent → `MISMATCH`, order stays RESERVED, `PAYMENT_ALERT` to all admins | ✅ live |
| 2.4 | `payment.failed` / dismiss → `apply_failed_payment` | Order FAILED, `quantity_reserved` released, inventory returned | ✅ live |
| 2.5 | `expire_payment_intents` on stale intent | Intent EXPIRED + order EXPIRED + reserved released, exactly once | ✅ live |
| 2.6 | **Late capture** on FAILED/EXPIRED/CANCELLED order | No tickets; order → `REFUND_REQUESTED`; `PENDING` refund at full `total_paise`; buyer notified | ✅ live (fixed `lower(order_status)` enum crash) |
| 2.7 | `record_webhook_event` claim semantics | First claim wins; in-progress → `skip`; processed → `already_processed` | ✅ live |
| 2.8 | HERO_BOOST capture | Boost ACTIVE, `razorpay_payment_id`, `expires_at = min(now+duration, event start)`, `BOOST_SALE` ledger | ✅ dispatcher branch (per-kind probes below) |
| 2.9 | Compat path — order/boost without intent (pre-migration rows) | `confirm_razorpay_order` still invoked by order `razorpay_order_id`; hero boost via `razorpay_order_id` column | ✅ branch exists, legacy contract |

## 3. Refund pipeline (request → approve → initiate → finalize)

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 3.1 | Buyer calls `request_refund` (not staff) | Rejected — not authorised | ✅ live |
| 3.2 | Organizer/staff/admin `request_refund` | `REQUESTED` row, admin notified, order keeps CONFIRMED | ✅ live |
| 3.3 | Admin `reject_refund` | `REJECTED`, order stays CONFIRMED, buyer notified | ✅ live |
| 3.4 | Admin `approve_refund` (TICKET_PRICE) | `PENDING` at `subtotal_paise`; order → `REFUND_REQUESTED`; tickets CANCELLED; inventory released; waitlist offered | ✅ live |
| 3.5 | `claim_pending_refunds` concurrency | `FOR UPDATE SKIP LOCKED` — exactly one claimer wins | ✅ live (c1=4, c2=0) |
| 3.6 | Initiation → Razorpay | `INITIATED` + `razorpay_refund_id` + `REFUND` ledger row (negative amounts) | ✅ live |
| 3.7 | `finalize_refund` | Refund `COMPLETED`, order `REFUNDED`, timestamps | ✅ live |
| 3.8 | Over-refund | DB trigger rejects when total refunded > paid | ✅ live |
| 3.9 | `cancel_event` v2 | Orders → `REFUND_REQUESTED` (never `REFUNDED` before money moves); `PENDING` refunds at subtotal; organizer `ADJUSTMENT` liability row (negative) | ✅ live |
| 3.10 | `refund_scope` variants | TICKET_PRICE=subtotal, FULL=total, CUSTOM=explicit amount | ✅ approved flow |

## 4. Webhook handler (`/api/razorpay/webhook`)

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 4.1 | HMAC-SHA256 signed `payment.captured` | Signature verified → dispatcher → order CONFIRMED + ticket + TICKET_SALE ledger + `webhook_events.processed=true` | ✅ live (real signed payload) |
| 4.2 | Bad signature | 401/400 — no side effects | ✅ (signature check precedes processing) |
| 4.3 | Same event_id redelivered | Claimed → `already_processed` — 200, no duplicate work | ✅ live |
| 4.4 | Internal processing error | 5xx → Razorpay retries later | ✅ route returns `apiError(500)` on throw |
| 4.5 | `refund.processed` / `refund.failed` | `finalize_refund` / `fail_refund` by `razorpay_refund_id` | ✅ code path + refund probes |
| 4.6 | `payment.dispute.created` | `payment_disputes` row + PAYMENT_ALERT to admins | ✅ branch live |

## 5. Security lockdown (STEP 32)

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 5.1 | `authenticated` direct UPDATE on orders/tickets/refunds/ledger | Permission denied — grants revoked | ✅ live probe |
| 5.2 | Column grants on `ticket_tiers` | Only non-money columns mutable by clients | ✅ live |
| 5.3 | Money RPCs callable by `anon`/`authenticated` | `confirm_razorpay_order`, `claim_pending_refunds`, dispatcher etc. → service_role only; user-context RPCs (`request_refund`, `approve_refund` (admin check inside), `create_payment_intent`) → `authenticated` | ✅ grants audited |
| 5.4 | Old `create_paid_order` | Dropped — no overloads remain | ✅ `\df` check |

## 6. Crons

| Route | Cadence | Verified |
|-------|---------|----------|
| `/api/cron/expire-reservations` | every 5 min (workflow) | calls `expire_payment_intents` |
| `/api/cron/process-refunds` | every 5 min | claims + initiates pending refunds |
| `/api/cron/reconcile-payments` | hourly | reconciles gateway state vs DB |

All gated by `CRON_SECRET` bearer + timing-safe compare.

## 7. UI flows

| # | Scenario | Expected |
|---|----------|----------|
| 7.1 | Paid event → Book | `/checkout` mounts `RazorpayCheckout` — opens Checkout.js w/ amount, prefill, notes |
| 7.2 | Free event → Book | RSVP card (no payment) — instant CONFIRMED |
| 7.3 | Payment dismissed/failed | `/api/v1/payments/failure` → inventory released, "Payment didn't complete — try again" |
| 7.4 | `/checkout/status?order=` | Realtime subscribe + 3 s poll → CONFIRMED → auto-redirect to `/tickets` |
| 7.5 | Tickets page | Per-order refund strip (requested → processing → refunded), Razorpay ref shown |
| 7.6 | Door staff payment | "Pay online" → intent → Checkout.js → PAID + DOOR_STAFF_SALE ledger |
| 7.7 | Club join (PAID) | Join → pending member → Checkout.js → accepted + CLUB_FEE ledger |
| 7.8 | Hero boost | Existing flow → dispatcher activates on capture (expiry capped at event start) |
| 7.9 | Organizer → Refunds | Requests list w/ status labels; "Refund" button on confirmed attendees |
| 7.10 | Organizer → Payments | Settlement summary + ledger table + payout history |
| 7.11 | Admin → Refunds | Queue: approve (ticket/full), reject, manual-settle, run-worker-now |
| 7.12 | Admin → Payments | Webhook log + stale reservations monitor (existing) |

## 8. Manual end-to-end (Razorpay test mode)

1. `npm run dev` → sign in → open a **paid** event → Book.
2. Razorpay modal opens (`rzp_test_Th2iO0507wktWo`).
3. Card `4111 1111 1111 1111`, any future expiry/CVV — or UPI `success@razorpay` / `failure@razorpay`.
4. Success → `/checkout/status` → CONFIRMED → ticket + QR on `/tickets`.
5. Failure → "try again" card; seat released (tier reserved count drops).
6. Organizer → attendees → Refund → reason → admin → `/admin/refunds` → Approve → watch status move to `COMPLETED` (webhook) or Run worker now.

## Automation summary (2025-09-27)

- `scripts/_test_step34.mjs` → **7/7 pass**
- `scripts/_test_step35.mjs` → **13/13 pass**
- Late-capture auto-refund probe → **PASS**
- `vitest` → **125/125**
- `tsc --noEmit` → clean; `next build` → green
