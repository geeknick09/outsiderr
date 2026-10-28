# Outsiderr - Money Math

**The cardinal rule:** every money figure lives in **`_paise` integers** and is computed **inside `SECURITY DEFINER` SQL functions** - never client-side, never floats. `create_reserved_order` is the source of truth.

## The order flow

1. User picks tier + quantity → `create_reserved_order` RPC reserves stock and computes the money
2. `orders.status = 'RESERVED'` (15-min TTL via `reservation_expires_at`)
3. Razorpay checkout → webhook `payment_intent.captured` → `CONFIRMED` → tickets minted
4. `payment_ledger` rows journal every money movement

## The core formula

```
subtotal        = tier.price_paise × quantity
commission      = subtotal × event.commission_bps / 10000        (0 if commission_enabled = false)
convenience     = subtotal × event.convenience_fee_bps / 10000   (0 if convenience_fee_enabled = false)
gateway         = (subtotal + convenience) × gateway_bps / (10000 − gateway_bps)   ← grossed-up!
platform_fee    = commission + convenience                       ← Outsiderr's revenue
```

**Why the gateway is grossed-up:** Razorpay charges its 2.36% on the *total it collects*, so we invert: `gateway = chargeable × rate / (1 − rate)`. If we added `chargeable × rate` plain, we'd lose ~2% of the gateway cost itself.

## Who pays what - `fee_payer` (per event)

| Party | BUYER (default) | ORGANIZER |
|-------|-----------------|-----------|
| Buyer pays | `subtotal + convenience + gateway` | `subtotal` only |
| Organizer receives | `subtotal − commission` | `subtotal − commission − convenience − gateway` |
| Platform keeps | `commission + convenience` (gateway recovers Razorpay's cut) | same |

### Example (₹1,000 ticket, BUYER pays, defaults)

```
subtotal      = 1,00,000 paise
commission    = 1,00,000 × 10% = 10,000      (commission_bps = 1000)
convenience   = 1,00,000 ×  2% =  2,000      (convenience_fee_bps = 200)
gateway       = 1,02,000 × 236 / (10000−236) = 2,460
total_paid    = 1,00,000 + 2,000 + 2,460 = 1,04,460 = ₹1,044.60
org payout    = 1,00,000 − 10,000 = 90,000 = ₹900
platform rev  = 10,000 + 2,000 = 12,000 = ₹120  (+ 2,460 covers the gateway fee)
```

## Rate defaults (all `platform_settings`, all admin-editable)

| Setting | Default | Meaning |
|---------|---------|---------|
| `default_commission_bps` | 1000 (10%) | Platform commission on subtotal |
| `default_convenience_fee_bps` | 200 (2%) | Buyer convenience fee |
| `gateway_fee_bps` | 236 (2.36%) | Razorpay's cut, grossed-up |
| `reservation_ttl_minutes` | 15 | Order reservation expiry |
| `cancellation_charge_percent` | - | Charge on buyer cancellations |
| `postponement_charge_percent` | - | Charge on organizer postponements |
| `promoter_payout_fee_bps` | 200 (2%) | Processing fee on promoter payouts |
| `promoter_min_payout_paise` | 100000 (₹1,000) | Min promoter payout |
| `promoter_org_share_bps` | 1000 (10%) | Referral share of platform commission on referred-organizer orders |
| `promoter_org_event_limit` | 5 | Paid events per referred organizer that earn the promoter |
| `promoter_org_link_ttl_days` | 30 | Creator-referral link lifetime |
| `promoter_org_attribution_days` | 30 | Click-to-signup attribution window |
| `promoter_commission_min/max_bps` | 500-3000 (5-30%) | Per-event promoter commission range |
| `promo_discount_max_bps` | 1500 (15%) | Max buyer discount via promo code |
| `promo_promoter_max_bps` | 1500 (15%) | Max promoter share via promo code |
| `community_max_per_organizer` | 10 | Communities per creator |
| `hero_boost_price` | 99900 (₹999) | 7-day hero boost |
| `premium_price_*_paise` | - | Organizer premium subscription prices |

Commission is **per-event** (`events.commission_bps` - admin-editable per event), falling back to `default_commission_bps`. Same for `convenience_fee_bps`, `commission_enabled`, `convenience_fee_enabled`, `fee_payer`.

## Promoters - the third money flow

Promoter commission is a share **out of the organizer's slice**, never on top:

```
promoter_commission = attributed_subtotal × event.promoter_commission_bps / 10000
                    (recorded on orders.promoter_commission_paise → promoter_earnings)
```

- **LINK mode** - organizer picks 5-30% commission
- **PROMO_CODE mode** - `promo_buyer_discount_bps` (buyer's discount off subtotal) + `promo_promoter_bps` (promoter's share)
- Promoter payout = `payable_earnings − processing_fee`
  - `processing_fee = payable × promoter_payout_fee_bps/10000` (default 2%)
  - fee + gross both stored in `payout_snapshot` for audit
- `promoter_min_payout_paise` (₹1,000) is the release threshold
- Refunds reverse earnings via `reversed_paise` - net payable = `earnings − reversals − payouts_paid`

## Creator referrals - the fourth money flow (Outsiderr's cost)

Promoters can also **onboard organizers**, not just push ticket sales. This
earning is paid **out of Outsiderr's commission** - it is never deducted from
the organizer's payout.

1. Promoter shares `/r/<slug>` → visitor lands on `/list-your-event` →
   click logged in `promoter_clicks` + `outsiderr_ref` httpOnly cookie dropped
   (TTL = `promoter_org_attribution_days`).
2. Organizer completes creator onboarding → `createOrganizerAction` resolves the
   cookie → `organizers.referred_by_promoter_id` stamped (self-referral blocked,
   first-write wins, immutable).
3. On each publish of a **paid** event, `trg_mark_org_referral` stamps
   `events.referral_promoter_id` while `referral_events_count <
   promoter_org_event_limit`. Free events never consume the window.
4. Confirmed order on a stamped event → `trg_org_referral_earning` mints
   `promoter_earnings` with `via='ORG_REFERRAL'`:

```
referral_earning = commission_paise × promoter_org_share_bps / 10000
                 = (subtotal × commission_bps) × share_bps / 10000

Example: ₹1,000 ticket at 5% commission → ₹50 commission → promoter gets ₹5
```

- `orders.promoter_id` stays NULL (no event-promotion attribution) - organizer
  payout math is untouched.
- Referral earnings join the normal promoter lifecycle: hold days, min payout,
  2% processing fee, refund clawback (`trg_refund_reverse_promoter` loops all
  earning rows on the order).
- Anti-abuse: links expire (`expires_at`, TTL = `promoter_org_link_ttl_days`);
  expired clicks are still counted but never attribute; admins can deactivate
  links; one referral link per promoter at a time.
- `/admin/promoters` maps promoter → onboarded organizers with window usage;
  `/admin/money` shows the full in/out summary including referral cost.

## Refunds

- Cancel/postpone → orders become refundable; `refunds` table tracks `amount_paise` + Razorpay refund ID
- Cancellation/postponement charge: `*_charge_percent` applies on the refund base
- Payment failure → order stays `RESERVED` → TTL expires → stock returns via the reserved-quantity release

## Where money columns live

| Column | Meaning |
|--------|---------|
| `orders.subtotal_paise` | face value × qty |
| `orders.commission_paise` | platform commission |
| `orders.convenience_fee_paise` | buyer fee |
| `orders.gateway_fee_paise` | grossed-up Razorpay recovery |
| `orders.platform_fee_paise` | commission + convenience |
| `orders.organizer_payout_paise` | what the organizer nets |
| `orders.total_paise` | what the buyer actually paid |
| `payment_ledger.*_paise` | same decomposition, journaled per movement |
| `payout_records.amount_paise` | payout paid to organizer |
| `promoter_earnings.amount_paise` / `reversed_paise` | earned / refunded-back |

**Verification path:** `/organizer/payments` ledger reads `payment_ledger` - if any row's math looks wrong, `create_reserved_order` is the single place to debug. Every derived number on the dashboards (revenue, net payout, conversion, platform fee) derives from these columns - they're never recomputed in UI code.
