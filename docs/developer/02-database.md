# Outsiderr - Database Schema Reference

All tables live in `public` (plus an `analytics` schema for pre-computed rollups). Every column is `snake_case`; app code maps to camelCase in data functions.

**Golden rules:** all money columns are `_paise` integers (₹1 = 100 paise). RLS is on for everything; service-role-only tables are revoked from `anon`/`authenticated` entirely and reached only via `SECURITY DEFINER` RPCs.

## Identity & accounts

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `auth.users` | Supabase auth identities | id, email |
| `profiles` | Public user profile - one per auth user. `is_admin` flips first user to admin via `auto_promote_first_admin` trigger | id (→ auth.users), full_name, avatar_url, city, gender, phone, interests[], is_admin |
| `organizers` | Creator/creator-profile record - owns events + communities. `kyc_status` gates publishing. `referred_by_promoter_id` + `referral_events_count` track promoter-referral onboarding | id, owner_id (→ auth.users), name, bio, avatar_url, intent, kyc_status, pending_kyc, bank_* columns, upi_id, referred_by_promoter_id, referred_at, referral_events_count |
| `organizer_bank_accounts` | Extra payout bank accounts per organizer | id, organizer_id, account_name, account_number, ifsc, pan, upi_id, is_primary |
| `organizer_follows` | User → organizer follow (profile Following section) | organizer_id, follower_id |

## Communities

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `communities` | A community (club/collective). `verified` = live on /communities | id, owner_id (→ organizers), name, bio, type (CLUB/CREW), category, subcategory, city, avatar_url, cover_url, mobile_cover_url, socials (instagram/youtube/x/linkedin/facebook/website), membership_type (OPEN/PRIVATE/INVITE_ONLY), membership_fee_paise, terms[], member_count, show_member_count, verified |
| `community_members` | Membership rows | community_id, user_id, status (PENDING/ACCEPTED/REJECTED/REMOVED), invite_code, imported |
| `community_join_questions` | Private-community application questions | community_id, question, is_mandatory, sort_order |
| `community_join_answers` | A member's answers to those questions | member_id, question_id, answer |
| `community_follows` | (legacy) user → community follow | community_id, user_id |
| `community_invites` | Rotating invite-token secret for INVITE_ONLY | community_id, token |
| `community_member_imports` + `community_import_items` | CSV member-import pipeline: file → row items → admin review | imports: community_id, filename, status, valid_rows/invalid_rows; items: import_id, name/phone/email, linked_user_id, status |

## Events & ticketing

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `events` | The event. `community_id` links it to a community; `visibility` gates booking; `referral_promoter_id` marks an organizer-referral earning event | id, organizer_id, title, description, category, categories[], tags[], city, venue_name/address/lat/lng/maps_link, starts_at, ends_at, status (DRAFT/PUBLISHED/POSTPONED/CANCELLED/COMPLETED), community_id, visibility (OPEN/MEMBERS_ONLY/INVITE_ONLY), referral_promoter_id, pricing fields (see money doc), recurrence, images (card_poster_url, banner_poster_url, teaser_video_url, photos[]), waitlist_enabled, allow_booking_during_event, max_tickets_per_user, organizer agreement fields |
| `ticket_tiers` | Sellable tiers per event (price × qty, phased windows) | event_id, name, price_paise, quantity, quantity_sold, quantity_reserved, sort_order, phase_opens_at/phase_closes_at, admits (reserved=1) |
| `orders` | A purchase (or pending one) - the money row | event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise, commission_paise, convenience_fee_paise, gateway_fee_paise, platform_fee_paise, organizer_payout_paise, total_paise, fee_payer, status (RESERVED/PENDING_VERIFICATION/CONFIRMED/REJECTED/CANCELLED/REFUND_REQUESTED/REFUNDED), order_source (ONLINE/BOX_OFFICE/WALKIN/GUESTLIST), buyer_*, reserved_at, reservation_expires_at, idempotency_key, razorpay_order_id, payment_ref, refund_*, promo fields |
| `tickets` | One ticket per order-unit. `qr_hash` is the door credential | event_id, order_id, user_id, tier_id, qr_hash, status (VALID/USED/CANCELLED), used_at, admit_count |
| `waitlist` | Sold-out waitlist (auto-backfill on cancellations) | event_id, user_id, status (WAITING/OFFERED/CONVERTED/EXPIRED) |
| `event_subscriptions` | "Update me" alert opt-ins per event | event_id, user_id |
| `event_invites` | Rotating invite-token secret for INVITE_ONLY events | event_id, token |
| `event_collaborators` | Co-hosts/staff on an event - LIMITED access level | event_id, organizer_id, invited_by, status |
| `event_staff` | Named door/box-office staff per event | event_id, organizer_id, name, phone, email |
| `event_reviews` | Post-event star reviews | event_id, organizer_id, user_id, rating, comment |

## Door operations

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `scanner_pins` | Rotating PINs that unlock the QR scanner for an event | event_id, organizer_id, pin_hash (hashed, never stored plain), role, expires_at |
| `box_office_pins` | PINs for the box-office sell flow | event_id, organizer_id, pin_hash, role |
| `door_staff_orders` | Paid door-staff requests (organizer pays for staff) | event_id, organizer_id, number_of_staff, service_amount_paise, status |
| `staff_members` + `staff_event_assignments` | Named staff accounts + per-event assignment | staff_members: owner_type, name, phone, password_hash; assignments: staff_id, event_id |
| `scan_log` | Every scan attempt (audit + replay protection) | event_id, qr_hash, outcome, actor_type, actor_id |

## Money & payouts

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `payment_ledger` | Append-only money journal - every paise movement | type, event_id, organizer_id, order_id, gross_paise, commission_paise, convenience_fee_paise, gateway_fee_paise, platform_fee_paise, net_organizer_paise, promoter_commission_paise |
| `payout_records` | Outgoing payments to organizers | organizer_id, event_id, amount_paise, status (PENDING/PROCESSING/COMPLETED/FAILED), method, bank_account_id, bank_reference, failure_reason, payout_snapshot (jsonb - bank details frozen at payout time) |
| `webhook_events` | Razorpay webhook idempotency | razorpay_event_id, event_type, created_at |
| `refunds` | Refund records tied to orders | order_id, event_id, amount_paise, status, razorpay_refund_id |

## Promoters (paid referrers)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `promoters` | Promoter account + payout bank details | user_id, name, email, phone, payout_account_name/number, payout_ifsc, payout_pan, upi_id, is_blocked |
| `promoter_links` | Tracked link - `link_kind='EVENT'` per event (`/p/<slug>`) or `'ORGANIZER'` creator-referral (`/r/<slug>`, one per promoter, `event_id` NULL, `expires_at` TTL) | promoter_id, event_id?, slug, link_kind, expires_at, is_active |
| `promoter_promo_codes` | Promo-code channel | promoter_id, event_id, code |
| `promoter_clicks` | Click log for both link kinds (dedupe by link + ip/ua hash) | link_id, ip_hash, ua_hash, referrer, clicked_at |
| `promoter_earnings` | Commission earned per attributed order - `via` = LINK / PROMO_CODE / ORG_REFERRAL (referral = Outsiderr's cost, never deducted from organizer payout) | promoter_id, event_id, organizer_id, order_id, via, kind (EARNING/CLAWBACK), amount_paise, reversed_paise, commission_bps, ticket_subtotal_paise, status (EARNED/PAID/REVERSED) |
| `promoter_payouts` | Outgoing payouts to promoters | promoter_id, amount_paise, status, payout_snapshot (incl. gross_paise, processing_fee_paise, processing_fee_bps) |

## Discovery & growth

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `page_views` | Per-user view logs → warm audience + conversion stats | user_id, entity_type (EVENT/COMMUNITY), entity_id, created_at |
| `share_events` | Share-button taps → virality | entity_type, entity_id, user_id |
| `boosts` | Paid visibility requests (slot + feature placement) | event_id, organizer_id, placement (HOME/COMMUNITIES/BOTH), slot, amount_paise, status, starts_at/ends_at, utr_reference |
| `boost_slot_prices` | Slot pricing config | slot, price_paise |
| `hero_boosts` | Homepage hero placements | event_id, organizer_id, amount_paise, status |
| `push_subscriptions` | Web-push endpoints | user_id, endpoint, keys |

## Notifications

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `event_notifications` | The bell feed - user + realtime | event_id, community_id, user_id, type (ORDER_*, PAYMENT_*, REFUND_*, PAYOUT_COMPLETED, COMMUNITY_EVENT, OUTREACH, KYC_*, WAITLIST_*, COLLAB_*, …), message, read |
| `notification_outbox` | External delivery queue (push/email) | user_id, event_id, type, message, channel, delivered_at |

## Platform ops & governance

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `platform_settings` | Key-value config - all fee rates, caps, copy | key, value, description |
| `admin_change_log` | Audit trail for every admin edit | admin_id, table_name, record_id, field_name, old_value, new_value |
| `compliance_tasks` | Admin ops task tracker | title, description, status, due_at |
| `kyc_messages` | Review-thread messages between admin + creator | organizer_id, sender_role, message |
| `legal_pages` + `legal_page_versions` | CMS for T&C/privacy/refund - version history + live pointer | pages: slug, title, content, version, is_published; versions: slug, version, title, content, saved_by_email |
| `event_terms_acceptances` | Per-event T&C acceptance record | event_id, organizer_id, terms_version |
| `analytics.*` | Pre-computed rollups for dashboards (daily_metrics, event_rollup, organizer_rollup, user_activity_days, user_order_stats, totals) | refreshed by `refresh_analytics` cron |

## How tables chain

```
auth.users ── profiles ── organizers ──┬─ events ── ticket_tiers ── orders ── tickets
                                       ├─ communities ── community_members
                                       └─ organizer_bank_accounts
events ── waitlist · event_staff · scanner/box_office_pins · scan_log · event_invites · boosts
orders ── refunds · tickets · payment_ledger rows · promoter_earnings
organizers ── payout_records          promoters ── promoter_links/codes/clicks/earnings/payouts
promoters ── organizers (referred_by_promoter_id) ── events (referral_promoter_id)
event_notifications + notification_outbox - fed by actions + RPCs, delivered realtime
```
