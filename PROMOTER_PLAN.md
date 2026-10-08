# Promoter program — links OR promo codes, organizer-funded commission, held payouts

Any signed-in user can promote an opted-in event. Per event the organizer picks ONE mode —
share-links (promoter earns a % off the organizer payout) or promo codes (buyer discount +
promoter commission). Commissions settle 7 days after the event ends, are paid manually by
admin to bank/PAN-verified promoters, and reverse automatically on every refund path.

Status: **planned, not built** (2026-10-09). See build order at the bottom.

## Decisions (confirmed with owner)

- **Two modes, organizer picks ONE per event** (`events.promoter_mode`):
  - `LINK` — promoter shares `/p/<slug>`; earns organizer-set % of gross subtotal (default 10%, admin-bounded). Buyer pays full price.
  - `PROMO_CODE` — promoter shares a code; buyer types it at checkout → buyer gets `promo_buyer_discount_bps`% off ticket value (default 5%) and promoter earns `promo_promoter_bps`% (default 5%). Both editable by organizer within admin bounds.
  - `NONE` — default; no promoter surface.
- **Who pays:** the organizer payout funds everything — commission AND the buyer discount. **Platform commission and promoter commission are both computed on the gross ticket price, never the discounted amount.** Convenience/gateway compute on the discounted payable.
- **No stacking:** an entered promo code always wins over a link cookie; each order uses at most one mechanism.
- **Approval:** instant registration; organizer can remove a promoter from their event afterwards; admin can blocklist.
- **Attribution:** link = `/p/<slug>` → click log → `oc_promo` httpOnly cookie (30d, last click wins) → any paid order for that event. Code = typed at checkout, validated server-side.
- **Payout hold:** earned at capture; payable `event.ends_at + promoter_hold_days` (7). Postponement extends automatically (reads current ends_at). Min payout ₹1,000 (`promoter_min_payout_paise` 100000). Admin pays manually to bank account.
- **Guardrails:** online paid orders only; no self-referral; organizer owner + ACCEPTED collaborators can't promote the event; organizer-remove / admin-block stop new attribution, keep earned.
- **Payout details:** bank account (holder name, account number, IFSC) + PAN collected on the promoter dashboard; masked in UI (`••••1234`, `AX****E`); snapshot frozen onto each payout row; payout can't be created without them.

## Money math (promo-code order, all server-side in RPC)

- `subtotal` = tier price × qty (gross).
- `discount` = round(subtotal × promo_buyer_discount_bps / 10000), capped at subtotal.
- `net` = subtotal − discount (what the buyer's money is based on).
- `commission` (platform) = f(**subtotal**) — existing rules/bps on GROSS.
- `convenience` = f(net) — % of the discounted ticket value.
- `gateway` = gross-up on (net + convenience) at `gateway_fee_bps`.
- `promoter` = round(subtotal × rate / 10000) — GROSS (link rate or promo promoter rate).
- fee_payer BUYER: `total = net + convenience + gateway`; `organizer_payout = net − commission − promoter`.
- fee_payer ORGANIZER: `total = net`; `organizer_payout = net − commission − convenience − gateway − promoter`.
- LINK-mode orders: discount = 0 → identical to today's math minus promoter.
- Guard: if discount + commission + promoter would push payout below 0 (extreme bps) → reject the code ("fees exceed ticket value").

## Refunds (how promoter tickets refund)

Buyer refunds are **unchanged** — cancel_event, request_postponement_refund, admin-initiated,
manual settle, auto-refunds all work as today (refund amount = the discounted `total_paise`).

One `AFTER INSERT` trigger on `refunds` reverses promoter commission on **every** path:

- Unpaid earning → proportional claw `refund.amount / order.total × earning` tracked in `reversed_paise`; fully clawed → `REVERSED`.
- Paid earning → insert a `CLAWBACK` row (negative amount, `reverses_id`); nets against future payouts — promoter owes it back through future earnings.
- Event cancelled → every earning reverses pre-payout; nothing to chase.
- Postponed → user-requested refunds reverse their orders; the payable gate reads the new ends_at so holds extend automatically.

## Schema (append to `supabase/migrations/fix_all.sql`; mirror into `supabase/schema.sql`)

New columns:
- `events.promoter_mode text not null default 'NONE' check in ('NONE','LINK','PROMO_CODE')`, `events.promoter_commission_bps int not null default 1000` (link rate), `events.promo_buyer_discount_bps int not null default 500`, `events.promo_promoter_bps int not null default 500` — all `between 0 and 10000`; bounds enforced in save action + RPC clamps.
- `orders.promoter_id uuid null`, `orders.promoter_commission_paise int not null default 0`, `orders.discount_paise int not null default 0`, `orders.promoter_via text null check in ('LINK','PROMO_CODE')`, `orders.promoter_link_id uuid null`, `orders.promo_code text null` (snapshot of the typed code).

New tables (RLS on, no policies — service-role only, same pattern as staff tables):
- `promoters` — id, `user_id unique`, upi_id nullable, `payout_account_name`, `payout_account_number`, `payout_ifsc`, `payout_pan` (nullable; required before payout), is_blocked, created_at.
- `promoter_links` — id, promoter_id, event_id, `slug unique`, is_active, `unique(promoter_id,event_id)`.
- `promoter_promo_codes` — id, promoter_id, event_id, `code` unique (store/compare UPPER), is_active, `unique(promoter_id,event_id)`.
- `promoter_clicks` — id, link_id, clicked_at, ip_hash, ua_hash, referrer (link mode only).
- `promoter_earnings` — id, `order_id unique`, promoter_id, event_id, organizer_id, `via`, link_id nullable, promo_code_id nullable, ticket_subtotal_paise (gross), commission_bps snapshot, amount_paise (negative on clawback rows), kind `EARNING|CLAWBACK`, status `EARNED|PAID|REVERSED`, reversed_paise default 0, payout_id, refund_id, reverses_id, created_at, paid_at.
- `promoter_payouts` — mirrors payout_records keyed by promoter_id + `payout_snapshot jsonb` (bank/PAN frozen at payout time).

`platform_settings`: `promoter_commission_min_bps` 500, `promoter_commission_max_bps` 3000, `promo_discount_max_bps` 1500, `promo_promoter_max_bps` 1500, `promoter_hold_days` 7, `promoter_min_payout_paise` 100000, `promoter_cookie_days` 30.

## RPCs (security definer)

1. `register_event_promoter(p_event_id)` → `{mode, slug, code}` — validates event mode + PUBLISHED|POSTPONED; rejects owner (`organizers.owner_id = auth.uid()`), ACCEPTED collaborator, blocked promoter. Creates `promoters` row on demand. LINK → get-or-create slug (8-hex gen loop); PROMO_CODE → get-or-create code (`NAME-4HEX` upper, retry on collision). Removed-by-organizer → error. Grant `authenticated`.
2. `organizer_remove_promoter(p_link_or_code_id)` — event owner/admin; deactivates link + code for that promoter+event.
3. `admin_set_promoter_blocked(p_promoter_id, p_blocked)` — admin only.
4. `create_reserved_order` → 10-arg (`+p_promoter_slug`, `+p_promo_code`; DROP old 8-arg to avoid overload ambiguity):
   - `p_promo_code` non-null → resolve for THIS event + active + mode=PROMO_CODE + promoter not blocked + `user_id <> auth.uid()` → else raise "Invalid promo code". Applies the discount math above.
   - else `p_promoter_slug` valid → link math (discount=0, link rate). Invalid slug → silently no attribution (stale cookie safe).
   - `v_payout` reduced by promoter; clamp guard above.
5. `apply_captured_payment` TICKET_ORDER branch → if `v_order.promoter_id is not null` → insert `promoter_earnings` EARNING (via + link/promo_code ids; amount = orders.promoter_commission_paise). `on conflict (order_id) do nothing`.
6. `trg_refunds_reverse_promoter` AFTER INSERT on `refunds` → proportional claw logic above.
7. Admin payout marking stays in TS service-client code (same pattern as payout_records).

## TypeScript

**Shared:**
- `data/promoters.ts` (server-only): `getPromoterContext`, `getPromoterDashboard`, `listPromotableEvents`, `getEventPromoters`, `getAdminPromoters`, `getPromoterBalances`, `settleablePaise`, `updatePayoutDetails`, `validatePromoCodeForCheckout` (returns {valid, reason, discountPreviewPaise}).
- `data/orders.ts` + `services/payments.ts` + `services/orders.ts`: `CheckoutInput.promoCode?` + `promoterSlug?` → `p_promo_code`/`p_promoter_slug`.
- `data/events.ts` + `lib/types.ts` + `db/database.types.ts`: new event/order columns, tables, RPC sigs.
- `lib/validation.ts`: `promoterPayoutDetailsSchema` — name 2–60, account 9–18 digits, IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`, PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`, optional UPI; `promoCodeInputSchema`; `becomePromoterSchema`.

**Routes/UI — buyer & promoter:**
- `src/app/p/[slug]/route.ts` — resolve → insert `promoter_clicks` (sha256 IP+UA) → `oc_promo` httpOnly 30d cookie → 302 `/events/<id>`; stale → redirect, no cookie.
- `src/app/promoter/page.tsx` + loading — auth-required dashboard.
- `web/actions/promoter.ts` — `becomePromoterAction`, `savePayoutDetailsAction`, `updateUpiAction`.
- `web/components/promoter/promote-button.tsx` — LINK → "Promote & earn X%" link card + copy + WhatsApp share; PROMO_CODE → code card + "buyers get Y% off".
- `web/components/promoter/promoter-dashboard.tsx` — stats (clicks/redemptions, sales, earned/pending/paid/clawed), link/code cards, earnings ledger (negative clawback lines), payout history, **bank details form** (masked once saved), discover-promotable-events.
- `src/app/events/[id]/page.tsx` — PromoteButton near TicketTiers when mode ≠ NONE.
- `web/actions/orders.ts` — `createCheckoutAction` reads `oc_promo` → `promoterSlug`; checkout page/form gets optional **Promo code** field → `validatePromoCodeAction` preview → `promoCode`.
- `shared/ui/layout/user-menu.tsx` — "Promote & earn" → `/promoter`.

**Organizer:**
- `edit-misc-section.tsx` + `event-form.tsx` — Promoters mode selector (None / Share links / Promo codes); conditional rate inputs (link % / discount % + promoter %).
- `organizer/actions/events.ts` — persist + bound vs settings at create & update.
- `organizer/components/promoters-panel.tsx` — event page section: per-promoter clicks/redemptions, sales, net earned, remove.
- `organizer/actions/promoters.ts` — `removeEventPromoterAction`.
- `app/organizer/events/[id]/page.tsx` — fetch + render (canScan gate).

**Admin:**
- `app/admin/promoters/page.tsx` + `admin/components/promoters-admin.tsx` — balances (earned/payable/paid/clawback), earnings browser, block toggle, payout create (needs bank details; ≥₹1,000 or override; snapshots bank+PAN), status transitions (COMPLETED needs bank ref) + `auditFinancialAction` — mirrors `admin/actions/payouts.ts`.
- `admin/actions/promoters.ts`; `admin/actions/admin.ts` SETTING_MINIMUMS + AdminSettingsPanel keys; nav entry.

**API v1 (minimal):** `POST /api/v1/promoters` (register → mode-aware link/code), `GET /api/v1/promoters/me` (summary), `POST /api/v1/checkout` accepts optional `promo_code` (mobile-ready; cookie path stays web-only).

## Edge cases

- Mode switched after registration → new orders follow current mode; earned stays (UI hint).
- Invalid/wrong-event/self code → checkout error; order proceeds without it.
- Abandoned reservations → earning exists only post-capture.
- Partial admin refund → proportional claw capped at earning amount.
- Free orders, counter/box-office sales → never attributed.
- Bank/PAN plaintext at rest behind service-role-only RLS (encryption deferred — flag).

## Verification

- Bundle dry-run → apply live.
- `tests/promoter.db.test.ts` (live, rolled back): both modes, attribution, discount math (total/payout/commission-on-gross), refusals, code-beats-cookie, reversal, CLAWBACK, payable gate, min payout, mode switch.
- Unit tests: IFSC/PAN/account validators, discount preview.
- tsc, lint, vitest, `next build`; curl `/p/<slug>` for cookie+302.

## Docs

task.md Phase-3 promoter row; memory.md; prd.md §6 (promoter line + discount rule) & §7 status; architecture.md; API_SPEC + openapi.

## Out of scope

No encryption-at-rest for bank fields; no auto-payout/RazorpayX; no per-tier rates; no TDS math; native-app link attribution deferred (promo_code API-ready).
