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
| 2.8 | HERO_BOOST capture | Boost ACTIVE, `razorpay_payment_id`, `expires_at = min(now+duration, event start)`, `BOOST_SALE` ledger | ✅ dispatcher branch |
| 2.8b | SLOT_BOOST capture | Boost ACTIVE, `BOOST_SALE` ledger at `daily_price × days` (duration multiplication verified: ₹5,000/day × 7 = ₹35,000) | ✅ live probe |
| 2.8c | SLOT_BOOST slot collision at capture | Boost REJECTED + `PENDING` auto-refund + `PAYMENT_ALERT`; **no** ledger row, no double-booking | ✅ live probe |
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

## 8b. Refund/keep offers (order-level, STEP 37)

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 8b.1 | `postpone_event` on a live event | Dates move, status stays **PUBLISHED** (no postponed section), POSTPONEMENT notif, CONFIRMED orders get `refund_offered=true` | ✅ live |
| 8b.2 | `decline_refund_offer` own order | Flag cleared; foreign order id → `false` (no-op) | ✅ live |
| 8b.3 | Refund via offer | REFUND_REQUESTED + PENDING refund (TICKET_PRICE, offer reason carried) + ticket CANCELLED + inventory released | ✅ live |
| 8b.4 | Idempotent re-request | Returns existing refund `is_new=false`, no duplicate row | ✅ live |
| 8b.5 | Refund with no open offer | `No refund offer is open` — blocked | ✅ live |
| 8b.6 | Edit: date change / city change | `updateEvent` flags orders + notification carries the choice | ✅ code (offerReason path) |
| 8b.7 | Edit: same-city venue change | Notification only — no offer (default keep) | ✅ code |
| 8b.8 | Ticket card | Panel renders on `refund_offered` + Realtime flips it on UPDATE | ✅ wired |
| 8b.9 | Homepage | POSTPONED events render inline in the live listing — no separate section | ✅ code |

## 9. Manual payouts (pre-RazorpayX settlement)

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 9.1 | Admin → `/admin/payouts` → "Owed to organizers" | `Σ net_organizer` on ledger − in-flight payouts | ✅ live (₹630 + ₹1,169 balances) |
| 9.2 | Schedule payout (amount, method, note) | `payout_records` PENDING row, audit logged | ✅ live |
| 9.3 | PENDING → PROCESSING → COMPLETED (bank ref required) | `completed_at`/`completed_by` set; **negative** PAYOUT ledger row → organizer balance → 0 | ✅ live probe |
| 9.4 | Complete without bank ref / FAIL without reason | Rejected with error | ✅ guard in `adminUpdatePayoutStatusAction` |
| 9.5 | Invalid transition (COMPLETED → PENDING) | Rejected | ✅ transition map |
| 9.6 | Organizer `/organizer/payments` | Balance due drops on COMPLETED; method chip + ref shown | ✅ page + math verified |
| 9.7 | Non-admin calls payout actions | `requireAdmin` throws — Not authorised | ✅ admin gate |

## 10. Accounting exports (`/api/admin/export/*`)

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 10.1 | `GET /api/admin/export/ledger` | CSV: full ledger w/ event + organizer names flattened | ✅ route |
| 10.2 | `GET /api/admin/export/payouts` / `refunds` / `orders` | CSV per entity incl. method, bank ref, failure reasons, fee splits | ✅ route |
| 10.3 | `?from=`/`?to=` filters | Rows bounded by date column | ✅ route |
| 10.4 | Signed-out | 401 | ✅ auth check |
| 10.5 | Signed-in non-admin | 403 | ✅ `is_admin` check |
| 10.6 | CSV escaping | Names containing `"`/`,`/newlines quoted correctly | ✅ `csvCell` |

## 11. Ledger integrity rules (always true)

- `net_organizer + net_platform` per row = `gross − fees` — enforced by the writers (dispatcher/RPCs).
- Refunds/ADJUSTMENT/PAYOUT rows carry **negative** amounts so `Σ net_organizer` is always the live receivable.
- `razorpay_payment_id` on ledger rows is partial-unique — a replayed webhook can't double-count a capture.

## Automation summary (2025-09-27)

- `scripts/_test_step34.mjs` → **7/7 pass**
- `scripts/_test_step35.mjs` → **13/13 pass**
- Late-capture auto-refund probe → **PASS**
- `vitest` → **125/125**
- `tsc --noEmit` → clean; `next build` → green

## §12 Retry-attempt failure semantics (STEP 40 — applied live)

`payment.failed` is PER-ATTEMPT — Razorpay fires it for every failed try inside
one checkout session, while the modal stays open for a retry. It must never
kill the order.

- [ ] Webhook `payment.failed` → `apply_failed_payment` returns
      `ATTEMPT_RECORDED:*`, bumps `payment_intents.failed_attempts` + `last_error`,
      order stays RESERVED, intent stays CREATED — verified live
- [ ] Old 1-arg `apply_failed_payment(text)` overload dropped live (it failed orders)
- [ ] Client `payment.failed` → soft in-modal warning only; reservation released
      on modal dismiss or TTL expiry, never on an attempt failure
- [ ] Reproduce the bug: fail attempt 1 (bad card) → retry succeeds → order
      CONFIRMED + tickets minted, NO refund row created
- [ ] Client verify racing the webhook → redirected to `/checkout/status`,
      poller settles — never shows a false failure
- [ ] Status page has no back link + popstate trap + "don't go back/refresh" note

## §13 Price-lock & sectioned editor (STEP 41 — live 2026-10-08)

Reservation already snapshots price + fees server-side; §13 adds the visible
lock and per-section editing.

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 13.1 | Open checkout → click Pay securely | Razorpay modal opens; banner "Price & seats locked - expires in MM:SS" ticks down to `reservation_expires_at` | ✅ code |
| 13.2 | Organizer edits tier price mid-checkout | Reserved order's `subtotal/fee` columns are already snapshotted — the reserved total never changes | ✅ RPC invariant |
| 13.3 | Phase boundary crossed while modal open | Reserved price unaffected (phase fields aren't re-read); modal `timeout` still capped at reservation expiry | ✅ code |
| 13.4 | Modal dismissed / payment cancelled | `abandon_payment` releases `quantity_reserved` instantly; banner gone on return to form | ✅ code |
| 13.5 | Reservation TTL expires mid-payment | Cron releases seats; a late capture lands in the auto-refund path | ✅ live |
| 13.6 | `/organizer/events/[id]` — all 8 edit sections start collapsed | Chevron opens the body; pencil enters edit mode; Cancel discards local state | ✅ code |
| 13.7 | Section Save posts only its fields | `updateEventSectionAction` fetches the event, overlays that section's fields, validates only that section — other sections' errors can't block the save | ✅ code |
| 13.8 | Venue TBA toggle in edit | `NOW`/`TBA` chips; TBA hides name/address/maps and posts `venue_mode=TBA`; Maps link required only when `NOW` | ✅ code |
| 13.9 | `lockLogistics` (co-organizer) | Details/Time/Venue/Misc sections render with the pencil disabled; Tickets/Media/Contact stay editable | ✅ code |
| 13.10 | Manage page panels | Collaborators, Door Staff & Scanner, Box Office PINs, Featured & Boost, Postpone/Cancel render inside `CollapsibleSection` | ✅ code |
| 13.11 | Em/en dashes removed | All `—`/`–` in `src/` replaced with `-`; no string-splitting logic used them as delimiters | ✅ sweep |

### Verification gate
- `tsc --noEmit` → clean
- `vitest run` → 125/125
- `next build` → exit 0

## §14 Counter (box office) sales & offline door cache (Phase 0 — 2026-10-09)

| # | Scenario | Expected |
|---|---|---|
| 14.1 | Counter sale with no tier selected | Refused: "Select a ticket tier". Client-typed amount is never used. |
| 14.2 | Double-click "Generate ticket" | One order, one ticket. Same `clientSaleId` on both calls. |
| 14.3 | Network drops after the sale commits, staff retries | Retry returns the original sale. No second ticket. |
| 14.4 | Staff changes tier/buyer after a failed attempt, then submits | New sale key. The earlier attempt is not reused. |
| 14.5 | Last seat sold at the counter | Next counter sale refused: "Sold out for this ticket tier". |
| 14.6 | Counter sale totals | Buyer total and organizer payout match online pricing for the same tier (convenience + gateway gross-up, commission). |
| 14.7 | Ledger for counter sale | One `TICKET_SALE` row; `razorpay_fee_paise = 0`; net organizer + net platform = buyer total. Appears on organizer payments and admin revenue. |
| 14.8 | Organizer payments page | Single "Deductions" column (gross minus net). No commission, convenience, or gateway columns. |
| 14.9 | Door device goes offline after cache download | Valid cached ticket accepted once. Second scan on the same device: "Already checked in (offline cache)". |
| 14.10 | Ticket already USED on server before cache download | Shows "already used", not "not found". |
| 14.11 | Cache contents (IndexedDB) | No buyer phone or email fields. |
| 14.12 | Cache download for an event with > 1000 tickets | All tickets present (paginated). |
| 14.13 | Cache download with a wrong PIN | Refused. No tickets returned. |

**Automated:** `tests/scanner-phase0.test.ts` (decisions, cache shape, sale key, UUID check). **Live DB:** `scripts/_verify_walkin_phase0.mjs` (rolled back; covers 14.2, 14.5, 14.6, 14.7, 14.1). **Manual (device):** 14.9 and 14.10 require airplane mode with a real door PIN. Not yet run.

## §15 Automated coverage for box office (2026-10-09)

| Area | Test |
|---|---|
| Walk-in price, fees, single ledger row, sale-key replay, no-tier refusal, sold-out | `tests/box-office.db.test.ts` (live DB, rolled back) |
| Staff register, PIN hashed, sign-in right/wrong PIN, unassigned refusal | same |
| Counter cash sale attributed, cash outstanding, handover once, cross-organizer assignment refused | same |
| Door PIN scoped to one event, VALID then ALREADY_USED, replay logged once, DUPLICATE_CONFLICT offline, WRONG_EVENT, CANCELLED, INVALID, expired session refused, every attempt logged | same |
| Door result carries no phone or email; outcome wording; phone normalising; staff input rules | `tests/box-office-units.test.ts` |
| Retry keeps the sale key, a changed sale starts fresh; offline decisions; cache has no PII | `tests/scanner-phase0.test.ts` |
| Counter and door screens render; PIN fields limited to six digits; admin and organizer pages closed to signed-out visitors; scan log closed | `e2e/box-office.spec.ts` (`npm run test:e2e`, after `npm run build`) |
| Counter sign-in error and phone retention | `e2e/box-office.spec.ts`, **fixme** (known server issue) |

Not automated: a real Razorpay counter payment, SMS/WhatsApp delivery, and the airplane-mode device test (§14.9, §14.10).
