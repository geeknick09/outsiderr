# PRD — Outsiderr

One-sentence purpose: defines *what* the product is, *who* it's for, and *what* ships in each phase — read before any product decision.
Last updated: 2025-09-20

## 1. Product overview

Outsiderr is a culture-first event and community platform for underground and street scenes (rap battles, cyphers, skate sessions, BMX meets, jams, gaming tournaments, alternate sports). Ticketing is a feature, not the identity — the product exists to connect people to scenes, crews, places, and real-world participation.

The full product constitution is `PRODUCT_VISION.md` (root). This file summarizes the vision; the vision doc wins on any conflict.

## 2. Problem statement

Mainstream event platforms (BookMyShow, District) optimize for search→checkout→schedule. They have no concept of scene, crew, spot, or participation history. Underground communities run on WhatsApp groups and Instagram DMs — no persistent identity, no door tooling, no way to verify who's coming, no money tracking.

## 3. Goals and non-goals

**Goals**
- Help people discover their local scene and physically participate in it.
- Give organizers real tooling: publish → sell → verify payments → scan at the door → get paid.
- Build the people↔crews↔places↔experiences↔content graph (the moat).
- Keep organizer money math 100% correct: commission, convenience fee, payout, refunds.

**Non-goals**
- Not a generic ticket marketplace.
- Not a social feed / Instagram clone.
- Not a generic event CMS.
- No premature microservice split — modular monolith until scale demands otherwise.
- No mainstream category expansion just for market size (authenticity over scale).

## 4. Target users

| Persona | Who | What they do |
|---|---|---|
| Participant | Skaters, bikers, rap fans, gamers, fitness crowd | Discover events, book tickets, follow organizers, join clubs, review |
| Organizer | Artists, crews, venues, community leaders | Publish events, sell tickets, manage door, track revenue |
| Door staff | Hired by organizer, no account needed | Scan QR tickets with a per-event PIN at `/scan` |
| Co-organizer | Another organizer invited to collaborate | Access gated by VIEW_ONLY / ANALYTICS / SCAN / FULL |
| Admin | Outsiderr team | KYC review, event/user moderation, boosts, settings, revenue, legal pages |
| Growth / campaign team | Internal or organizer marketers | (Planned) Track ad clicks → bookings attribution |

## 5. MVP feature map (shipped)

| Feature | Module | Key routes / files |
|---|---|---|
| Auth + profile (name, birthdate, phone, interests) | shared/web | `/login`, `/profile` |
| Event discovery (city, category, search, hero carousel, featured, today, popular, past) | web | `/` |
| Event page (tiers, gallery, map, terms, reviews, co-organizers, linked editions, Update-Me, share) | web | `/events/[id]` |
| Booking: Razorpay checkout + legacy manual UPI/UTR, free tickets, waitlist | web | `/checkout`, `actions/orders` |
| Ticket wallet (QR, expandable card, expired state, print) | web | `/tickets` |
| Organizer onboarding: 5-step KYC wizard (profile→PAN→GST→bank→agreement) | organizer | `/organizer` (first visit), `become-organizer-form` |
| Organizer dashboard (events, create, verify payments, analytics, clubs tabs) | organizer | `/organizer` |
| Event management (edit, cancel, postpone, publish, boost, staff, PINs, gallery, collaboration) | organizer | `/organizer/events/[id]` |
| KYC admin review (approve/reject/clarify + bell notifications) | admin | `/admin/kyc` |
| Organizer rejection cap + resubmission (`rejection_count`, `organizer_rejection_limit`) | admin/organizer | `organizer-eligibility` |
| Door scanner (per-event PIN auth, hashed PINs, offline queue, rate-limited) | scanner | `/scan`, `/organizer/events/[id]/scan` |
| Box office / walk-in orders (PREEEVENT/QR/INSTANT modes, idempotency key) | scanner/organizer | `/organizer/box-office` |
| Check-ins page (checked-in / not / cancelled lists) | organizer | `.../checkins` |
| Orders + manual payment verification queue + printable report | organizer | `.../orders`, `.../report`, `/organizer?tab=verify` |
| Organizer analytics (per-event + aggregate + 30-day revenue trend) | analytics | `/organizer?tab=analytics` |
| Admin dashboard (stats, events CRUD, users, orders, payments, payouts, boosts, hero boosts, clubs, scanner/box-office PINs, settings, legal, revenue, analytics) | admin | `/admin/*` |
| Slot boosts + Hero boost (7-day rotation, eligibility, UPI→Razorpay, admin verify) | organizer/admin/web | `?source=HERO_BOOST` tracking |
| Clubs & crews (create, join, paid membership, cover photo, admin verify) | web | `/clubs` |
| Reviews (checked-in only, 1–5★ + text, organizer aggregate) | web | organizer profile + completed event |
| Engagement: Update-Me subscriptions, follow organizers, co-organizer collab invites | web/organizer | event page, `/organizers/[id]` |
| Realtime notification bell (cancel, postpone, venue/city/time change, waitlist, collab, KYC) | shared | navbar bell, `event_notifications` |
| Legal pages (DB-backed, admin CRUD, markdown, `/legal/[slug]`), About, Contact, footer | admin/web | `/admin/legal`, `/legal/[slug]` |
| Platform settings (commission bps, taglines, boost/door-staff/charges pricing) | admin | `/admin/settings`, `platform_settings` |
| PWA (manifest, SW, icons) + theme-aware logo + branded loaders | shared | `public/sw.js`, all `loading.tsx` |
| Hardening: Sentry, pino logger (redaction), Zod validation, rate limiting, idempotency keys, hashed PINs, ISR + `revalidateTag("events")`, DB backup cron | shared | `lib/logger`, `lib/rate-limit`, `lib/validation`, `/api/cron/backup` |

## 6. Financial model (canonical — never change silently)

- Buyer pays `subtotal + convenience_fee`.
- Organizer receives `subtotal − commission` (cancellation/postponement charges also deducted).
- Platform retains `commission + convenience_fee`.
- Walk-in / box-office orders: `convenience_fee = 0`, commission still applies.
- Fee snapshots stored per order: `commission_paise`, `convenience_fee_paise`, `organizer_payout_paise` — historical orders never change when settings change.
- Canonical test: `tests/financial.test.ts` (10 × ₹450 example).
- All money = integer paise, never floats.

## 7. Post-MVP roadmap (ordered)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Custom domain + Vercel DNS | Not started | blocker for launch |
| 2 | Phone + OTP auth | Not started | replaces email/password |
| 3 | Notification providers (email/SMS/WhatsApp) | Not started | behind `sendNotification` abstraction — itself Not started |
| 4 | Online events (WhatsApp/Zoom/Teams meeting link) | Not started | |
| 5 | Guest checkout | Not started | |
| 6 | Event analytics (views, conversion, sales-over-time) | Not started | analytics module |
| 7 | Cron jobs (venue/event reminders, media cleanup, refund checks) | Partial | `expire-reservations`, `expire-waitlist-offers`, `cleanup-teasers`, `backup` exist; scheduled via GitHub Actions (`.github/workflows/cron.yml`) |
| 8 | Audit log table | Not started | `audit.ts` helper exists, table deferred |
| 9 | Refund fee-bearer choice + organizer settlement dues | Designed | full spec migrated into task.md Phase 3 |
| 10 | Data archival (3-month retention), media cleanup | Not started | |
| 11 | RBAC beyond admin/organizer/user | Partial | co-organizer tiers are the lightweight version |
| 12 | Automated organizer settlements / payouts | Not started | `payout_records` table + admin page exist, automation deferred |
| 13 | Push notifications | Not started | `push.ts` + `push-subscribe` exist, provider wiring deferred |
| 14 | Staging environment (E11) | Not started | step-by-step in task.md |

## 8. Campaigns — planned domain (design now, build later)

**Problem.** Organizers share event links on Instagram/WhatsApp/posters but can't tell which channel actually sells tickets. Growth team has no click→booking attribution.

**Goal.** Trackable campaign links per event/channel: clicks, unique clicks, click→booking conversion, attributed revenue.

**Planned data model** (not yet in schema):

| Table | Columns (planned) |
|---|---|
| `campaigns` | id, organizer_id, event_id nullable, name, channel (INSTAGRAM/WHATSAPP/POSTER_QR/OTHER), utm_source/medium/campaign, status, created_at |
| `campaign_links` | id, campaign_id, slug unique, destination_url, created_at |
| `click_events` | id, link_id, ts, ip_hash, ua_hash, referrer, country, device |
| `attributions` | id, order_id unique, campaign_id, link_id, first_click_at, last_click_at, model (FIRST_TOUCH/LAST_TOUCH) |

**Planned flow**
1. Organizer creates campaign → gets `/c/[slug]` link.
2. `/c/[slug]` route: insert click_event (hash IP+UA — no raw PII), set `oc_<campaign>` cookie (30d), 302 → destination.
3. Checkout reads the cookie → on `confirm_*_order` writes `attributions` row.
4. Organizer dashboard → "Campaigns" tab: clicks, uniques, bookings, revenue per link. Admin sees platform-wide roll-up.

**Design constraints:** last-touch default model; cookie-only attribution (no fingerprinting); IP/UA stored hashed; clicks counted server-side at redirect, not by a JS pixel (blocker-safe).

## 9. Success metrics

- Paid bookings per event; organizer payout accuracy (zero disputes).
- Scan success rate at door; check-in latency.
- KYC review turnaround time.
- Organizer retention (repeat events), co-organizer invite acceptance rate.
- Update-Me subscription → booking conversion.
- (Post-campaigns) attributed bookings per campaign.
