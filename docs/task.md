| Completed || Completed || Completed || Completed || Completed |# Tasks — Outsiderr tracker

One-sentence purpose: the single source of truth for what is done, in progress, blocked, and planned — replaces `BACKLOG.md`.
Last updated: 2026-10-08

**Status values:** `Not started` · `In progress` · `Completed` · `Blocked`
**How to update:** tick the row, add a dated remark. Every task keeps `Module | Status | Blockers | Remarks`.

---

## Phase R — Domain-module restructure (active)

Goal: reorganize `src/` into `src/modules/{shared,web,organizer,admin,scanner,analytics,campaigns}` so each domain can later become `apps/<name>` in a monorepo with a mechanical move. Routes in `src/app` become thin. Boundaries enforced by module entry files (`index.ts` / `server.ts` / `actions/*`) + ESLint `no-restricted-imports`. **One commit per green phase; never push.**
Full plan (authoritative detail): `C:\Users\Anurag Shaw\.devin\plans\plan-e9605775583d9b9f.md`

| Step | Task | Status | Remarks |
|---|---|---|---|
| R0 | Cleanup `apps/` `packages/` stubs + build logs; write 6 docs; migrate root docs → `docs/reference/`; AGENTS.md→pointer; README; Tailwind content glob + ESLint boundary rule (legacy pattern commented until R8) | Completed | Committed `b2e9ae4`. |
| R1 | `modules/shared`: ui/, auth/ (supabase clients+middleware), db/ (database.types), lib/ (constants, types, format, pricing, phases, validation, logger, rate-limit, audit, upload, upi, razorpay*, event-lifecycle, organizer-eligibility, backup, cron), hooks/, data/ (events, orders, organizers, organizer-profile, profile, platform-settings, notifications, waitlist, clubs, reviews, engagement, door-staff, scanner-pins, box-office-pins, boosts, hero-boosts, event-orders, tickets), actions/ (auth, profile, notifications, push) | Completed | `shared/data` holds entity queries used by ≥2 sibling apps (→ future packages/db). `organizer.ts` split→ shared/organizer-profile + organizer/organizer-events + analytics/organizer-analytics. `admin.ts` split→ admin/admin + analytics/admin-analytics + shared/event-orders + shared/tickets. `organizer-eligibility` kept in shared/lib (navbar uses it). Codemod `scripts/_rewrite_imports.mjs`: intra-module→relative, cross-module→public entry, split-file symbol routing, dynamic-import handling. Middleware uses `@/modules/shared/auth/middleware` direct. vitest stubs `server-only`. |
| R2 | `modules/scanner`: components/{scan,box-office}/, organizer/{door-scanner,event-door-scanner,walkin-checkin-form}, lib/offline/, actions: verifyScannerPinAction + check-in + box-office order actions | Completed | Smallest module — proves the pattern. |
| R3 | `modules/admin`: components/admin (minus analytics 3), data/{admin,legal-pages,kyc review fns}, actions/{admin,kyc,legal-pages, hero-boosts admin half} | Completed | Fixes smell: organizer pages stop importing admin — `listEventOrders/listEventTickets` move to shared/data. |
| R4 | `modules/organizer`: remaining components/organizer (~28), data/{organizer event-CRUD parts,event-staff,door-staff,scanner-pins,box-office-pins,kyc submit side}, collab half of engagement.ts, actions/{events,organizer,event-staff,door-staff,boosts,box-office,scanner-pins generate/revoke, engagement collab half, hero-boosts purchase half} | Completed | `lib/organizer-eligibility.ts` → `organizer/lib/` (used by its tests). |
| R5 | `modules/web`: components/{events,checkout,tickets,clubs,profile,reviews}/ + organizer/follow-button, data/{clubs,reviews, engagement web half, hero-boosts+boosts read side}, actions/{orders,clubs,reviews,waitlist, engagement web half} | Completed | Largest route surface: home, events, checkout, tickets, clubs, profile, organizers, legal, about, contact, login, list-your-event. |
| R6 | `modules/analytics`: organizer/{analytics-panel,aggregated-analytics}, admin/{analytics-charts(+lazy),user-analytics-export}; data fns: getOrganizerEventAnalytics + getOrganizerDailyRevenue (from organizer.ts), getEventAnalytics + getUserAnalytics + getPaymentAnalytics + getOrganizerAnalytics + getRevenueAnalytics (from admin.ts) | Completed | |
| R7 | `modules/campaigns`: README + types.ts + index.ts (no tables/UI — data model lives in prd.md §8) | Completed | |
| R8 | Enforce: legacy dirs deleted, ESLint legacy-path rule uncommented, boundary greps return 0, routes thin, codemod deleted, docs synced | Completed | Audit cmds: `find src/lib src/components src/actions -type f` → 0; `grep -rn "@/modules/\(web\|organizer\|admin\|scanner\|campaigns\)" src/modules/shared` → 0 |

> **Placement corrections (don't regress):** `club-form`, `club-members-panel` used by BOTH /organizer + /clubs → `shared/ui/community`. `follow-button`,`join-club-form`,events/checkout/reviews/tickets UI → `web`. Cross-domain actions `clubs`,`engagement`,`hero-boosts`,`reviews` → `shared/actions`. `boosts`+`events` → `organizer/actions`. `orders`+`waitlist` → `web/actions`. `approveOrder`/`rejectOrder` → `organizer/actions/order-verify`. `src/{components,actions,lib}` emptied+deleted.

---

## Phase 1 — MVP (Completed)

Grouped by domain. Full detail was in `BACKLOG.md` (now superseded); test cases in `docs/reference/test-scenarios.md`.

| Area | Items shipped | Status |
|---|---|---|
| Events | create/edit (map picker, GMaps link, tags), FREE/FLAT/PAID + multi-tier, phased flat pricing, poster+gallery (≤8 photos), TBA venue, contact details, linked past editions, past-event handling, Gaming category + "Alternate Sports & Fitness" | Completed |
| Users | profile (name/birthdate/phone/interests), tag auto-merge on booking, dynamic organizer label in menu | Completed |
| Organizer | onboarding + 5-step KYC (PAN/GST/bank/UPI/agreement), profile edit + cover, dashboard, event mgmt, T&C versioning | Completed |
| KYC review | `/admin/kyc` approve/reject/clarify + bell notifications + status banner + rejection cap (`organizer_rejection_limit`, default 5) + resubmission | Completed |
| Booking | Razorpay checkout via unified payment intents (orders/boosts/door-staff/clubs), webhook + client-callback capture dispatcher, gateway-fee gross-up, free RSVP, waitlist, refund pipeline | Completed |
| Payments platform | `payment_intents` + `apply_captured_payment` dispatcher, `payment_ledger` (all money types), late-capture auto-refund, amount-mismatch lock + admin alert, refund state machine (requested→pending→initiated→completed), reconciliation cron | Completed |
| Tickets | QR wallet, expandable cards, expired state, print, walk-in (3 modes), box-office | Completed |
| Scanner | per-event PIN (hashed, rate-limited, staff name+email+phone), offline queue sync, per-event check-in | Completed |
| Engagement | Update-Me subscriptions, follow organizers (manual + auto-follow on purchase; followers get NEW_EVENT on publish), co-organizer collab w/ 4 permission tiers | Completed |
| Boosts | slot boosts (manual UPI, admin approve), hero boost (7d rotation, eligibility, ₹999 default, `?source=HERO_BOOST`) | Completed |
| Clubs | create/join/members, cover photo, paid membership, admin verify | Completed |
| Reviews | checked-in-only 1–5★ + text, organizer aggregate | Completed |
| Admin | overview, events CRUD, users, orders, payments, payouts, boosts, hero boosts, clubs, scanner/box-office PINs, door staff, settings, legal CRUD, revenue, analytics, strict `is_admin` auth | Completed |
| Legal/info | DB-backed `/legal/[slug]` markdown, `/about`, `/contact`, footer, taglines | Completed |
| Platform | `platform_settings` (commission bps, pricing, taglines), ISR + revalidateTag, PWA, theme logo, branded loaders, 404 | Completed |
| Hardening | Sentry, pino+redaction, Zod (35 tests), rate limiting, idempotency keys, hashed PINs, backup cron (`/api/cron/backup` daily+weekly), ISR | Completed |

## Phase 2 — Launch blockers

| Task | Status | Blockers | Remarks |
|---|---|---|---|
| Custom domain + Vercel DNS/SSL | Not started | domain purchase + DNS access | `vercel.json` currently `{}` |
| Phone + OTP auth | Not started | Supabase phone provider config | replaces email/password |
| `sendNotification(user,type,data)` abstraction | Done | — | `shared/notifications.ts`; in-app channel live, push/email/whatsapp stubbed |
| Email/SMS/WhatsApp providers | Not started | provider accounts | behind abstraction |
| Staging env (E11) | Not started | manual Supabase+Vercel setup | steps preserved below |
| GitHub Actions cron config | Partial | repo secrets `CRON_SECRET` + `APP_URL` | `.github/workflows/cron.yml` — reservations+waitlist `*/5min`, backups daily/weekly, teaser cleanup daily |
| Production hardening & QA pass | In progress | — | run `docs/reference/test-scenarios.md` |

## Box office & door scanning redesign — In progress

Plan: `C:\Users\Anurag Shaw\.devin\plans\plan-e9605775583d9b9f.md` (5 phases). Decisions: named staff (phone + personal PIN), counter pay via Razorpay or cash (same fee rules; cash gateway portion kept by platform), door scanning offline / sales online, admin staff any event / organizer staff own events, ticket by phone link only, organizers see payout + total deduction only.

| Phase | Status | Remarks |
|---|---|---|
| 0 — current-bug fixes | Completed (local commit, not pushed) | Walk-in ledger + capacity + tier-required + client sale key; PIN-gated offline cache (paginated, no PII); local USED marking; organizer payout view. Live DB: `create_walkin_order` applied via `_apply_phase0_walkin.mjs`, 9 live checks pass (rolled back). Full `fix_all.sql` bundle still doesn't apply in one shot (see memory.md 2026-10-09). |
| 1 — staff registry | Completed (pushed) | bcrypt-hashed personal PINs, shown once; admin (any event) and organizer (own events) staff at /admin/box-office-staff and /organizer/staff. Live RPC checks pass. Legacy box_office_pins not migrated (no phone on them); their counter page still works for existing PINs.
| 2 — counter sales | Completed (pushed) | /box-office: phone + PIN sign-in (12h token), assigned events only, cash sale through create_walkin_order with attribution, ticket link, cash-to-collect and handover on the staff page. **Razorpay at the counter built (2026-10-09):** `create_counter_reserved_order` reserves the seat as a guest order (user_id NULL, sale_channel COUNTER_RAZORPAY), the shared intent→dispatcher pipeline confirms it, `RazorpayCheckout` renders the modal on the counter device, `/box-office/order/[orderId]` shows the issued ticket. Guest-order fix: `payment_intents.user_id` and `refunds.user_id` dropped NOT NULL; `confirm_razorpay_order` skips notifications for NULL user. SMS/WhatsApp delivery is not built (adapters are stubs).
| 3 — scan attribution | Completed (pushed) | scan_log on every token scan; door sessions (12h) bound to one event; WRONG_EVENT names the ticket real event; organizer scan log at /organizer/events/[id]/scan-log. Offline queue no longer stores the PIN. Legacy PIN check path kept for entries queued before this change.
| 4 — offline hardening | Partly completed | DUPLICATE_CONFLICT for offline scans used elsewhere; cache refresh every 3 min; cache holds no PII. **Not built, on purpose:** signed QR. qr_hash is a random token, and an offline device only accepts hashes from its own cache, so forgery offline needs the random value. Signing would mean reissuing every printed ticket. **Not built:** batch sync endpoint (scans sync one by one). **Not run:** airplane-mode device test.
| 5 — cleanup | Completed | Organizer event page no longer issues legacy box-office PINs. Counter staff are now managed inside the event page's Box Office section (name + email + phone → personal PIN, same UX as the door-PIN generator). /organizer/box-office redirects to /box-office; the dashboard nav item and the user-menu "Box Office" link are removed. 1 legacy box_office_pin remains live, unused since 2026-09-26. openapi: no new /api/v1 routes added, so nothing to document yet.

- **Open:** SMS/WhatsApp ticket delivery; device airplane-mode test; legacy box-office PIN counter retirement (after existing PINs expire); a real swipe in the Razorpay modal (test keys verified).
- **Fixed (2026-10-09):** counter sign-in `window is not defined` — `organizer/index.ts` barrel did `export * from "./components/map-picker"`, pulling Leaflet into the server bundle. Barrel export removed; `map-picker.tsx` now imports `client-only` so the build fails if it ever leaks server-side again. E2E counter sign-in test un-skipped and green.
- **Tests (2026-10-09):** `tests/box-office-units.test.ts` (scan results without PII, phone normalisation, staff input), `tests/box-office.db.test.ts` (19 steps of the whole flow against the live DB, one rolled-back transaction, skipped without DB credentials; mutation-checked), `e2e/box-office.spec.ts` (Playwright on the production build: `npm run build`, then `npm run test:e2e`).

## Organizer event sections — In progress

| Task | Status | Blockers | Remarks |
|---|---|---|---|
| Section navigation for create, draft, and published event editors | In progress | Production build completion | Reusable details, schedule, venue, and ticket sections are integrated with local edit state and the existing full-form `updateEventAction` persistence boundary. TypeScript diagnostics are clean, Vitest is 125/125 green, and ESLint passes. The final Next.js production build reached compilation but did not produce a `BUILD_ID` or completion output, so deployment readiness remains blocked until a clean build completes. Browser gallery drag-and-drop, media replacement/deletion, and section save/cancel smoke tests remain. |

## Phase 3 — Post-launch

| Task | Status | Remarks |
|---|---|---|
| Online events (meeting platform+URL) | Not started | |
| Guest checkout | Not started | |
| Event analytics (views/conversion) | Not started | analytics module |
| Cron: venue/event reminders, media cleanup, refund checks | Not started | |
| Audit log table + wiring | Not started | `audit.ts` helper exists |
| **Refund fee-bearer + settlement dues** | Designed | Organizer picks who bears convenience fee on cancel/postpone (ORGANIZER: full refund, dues += fee+charge / USER: refund subtotal, dues += charge). `payment_ledger` ADJUSTMENT rows, `settlement_status`, organizer dues card + admin settle page. |
| Data archival (3-month) + media cleanup | Not started | |
| RBAC beyond admin/organizer/user | Not started | collab tiers = lightweight version |
| Automated organizer settlements | Not started | `payout_records` + admin page exist |
| Push notifications | Not started | `push.ts` + subscribe component exist |
| Admin analytics (DAU/MAU) | Partial | `getUserAnalytics` exists; trend UI thin |
| **Promoter program ("Become a Promoter")** | Not started | Users promote events and help sell tickets; each sold ticket pays the promoter a commission **set by the organizer** (per event/tier). Outsiderr's platform commission always applies on ticket price regardless. Design notes: track via promoter links/codes (reuse Phase 4 campaign attribution pipeline), `promoter_commission_bps` on events/tiers, promoter application + dashboard (clicks, sales, earnings), payout via `payment_ledger`/payout pipeline, admin oversight. Sequence after Razorpay payments plan (STEP 32–36) + campaigns attribution. |

## Phase 4 — Campaigns MVP (planned)

| Task | Status | Remarks |
|---|---|---|
| Schema: `campaigns`, `campaign_links`, `click_events`, `attributions` | Not started | model in prd.md §8 |
| `/c/[slug]` redirect + click logging + `oc_<c>` cookie | Not started | server-side count, hashed IP/UA |
| Attribution on `confirm_*_order` (last-touch default) | Not started | |
| Organizer "Campaigns" tab + admin roll-up | Not started | |

## Phase 5 — Vision roadmap (from PRODUCT_VISION.md; pointers only, not implementation tasks)

Scene graph model · experience types beyond events (cyphers/sessions/battles/jams) · artist/rider profiles · Outsider Score reputation · crew-vs-crew · crew content/history · places as first-class objects + discovery · culture feed (scene-linked, NOT generic social) · experience-linked content + clips (+ video embeds, video cards need media pipeline) · scene-based home screen + "Happening Now" · organizer identity types (crew/artist/venue/brand) · Outsiderr Originals · battle mechanics + challenges · follow-everything + participation history · sponsorship/campaign framework · merch & drops · premium organizer SaaS · keep categories narrow (authenticity over scale).

## Phase M — Mobile apps (3 native: Outsiderr / Organizer / Scanner; admin stays web)

**Done — M1/M2/M4/M5 implemented; M3 skipped (email-only auth for now).** Full doc: `docs/mobile.md`.

- **M1 `/api/v1` REST surface (32 routes)** — `src/app/api/v1/*`. Bearer JWT via `withApiUser` (AsyncLocalStorage context → `createClient()` resolves bearer transparently — all data fns/RPCs/`getCurrentUser()` work unchanged); PIN-in-body for scanner/box-office. Envelope `{ ok, data|error }`. Payment/event orchestration extracted to `shared/services/orders.ts` (shared by actions + routes). Full contract in `GET /api/openapi.json`.
- **M2 `sendNotification()`** — `shared/notifications.ts`, channels `in-app|push|email|whatsapp` (in-app implemented; push/email/whatsapp = adapter stubs). All insert sites migrated. Never throws.
- **M4 conventions** — `docs/rules.md` §4a.
- **M5 api client** — `shared/api/client.ts` (`createOutsiderrClient`) — pure TS, RN-portable, seed of `packages/api-client`.

Sequencing when mobile lands: Scanner → Outsiderr → Organizer. React Native/Expo (Capacitor rejected).

**Open follow-ups:**
- Wire a push provider (`sendNotification` `push` channel resolves subscriptions but doesn't send — needs Expo Push/FCM when apps exist).
- Razorpay test-mode verified end-to-end (signed webhook capture → CONFIRMED → ticket → ledger; refund pipeline 13/13; dispatcher 7/7 — see `docs/payment-test-scenarios.md`). Live-payment E2E still needs `rzp_live_` keys + activated Razorpay account for real payouts.
- M3 (phone OTP + `outsiderr://` deep-link scheme) deferred — email-only auth for now.
- Sole-waiter edge: a lone waitlisted user whose offer lapses gets re-queued and immediately re-offered (notification spam each cycle) — cap re-offers or add a permanent `EXPIRED` state if it becomes noisy.
- **Search at scale (do when traffic/events grow):** `listEvents` search is `ilike %term%` on title/venue/description + organizer-id resolution — full-scans published events per keystroke (400ms debounce). Upgrade path: `pg_trgm` extension + GIN index on `title`/`venue_name`/`description`, or a `tsvector` column + `websearch_to_tsquery` (also enables typo tolerance + relevance ranking). Consider a dedicated `/search` page with an "Organizers" results section (see below).

---

## Known issues / action required

- **Photo uploads:** profile, organizer profile, onboarding avatar, event poster/banner, and gallery photo inputs no longer reject oversized source files. All photo uploads pass through `compressImage()` before storage; the existing 1 MB compressor target, 8-photo gallery cap, and separate KYC/video limits remain unchanged.
- **Migrations:** all pending SQL lives in `supabase/migrations/fix_all.sql` — run `node scripts/_apply_fix_all.mjs`. Last applied to live DB: 2025-09-20 (includes scanner `staff_email`/`staff_phone`, `organizers.kyc_*`, KYC notification enum values, `event_notifications.event_id` now nullable, `generate_scanner_pins` 4-arg signature — old 2-arg overload was dropped).
- **Env vars to set:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (`.env.example`).
- **Razorpay webhook:** `https://<domain>/api/razorpay/webhook`, subscribe `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`.
- **Cron — GitHub Actions** (`.github/workflows/cron.yml`, free): needs repo secrets `CRON_SECRET` + `APP_URL`. Jobs (each gated to its own schedule): `expire-reservations` + `expire-waitlist-offers` every 5 min, `backup?type=daily` at 02:00, `cleanup-teasers` at 02:30, `backup?type=weekly` Sun 03:00.
- **Waitlist FIFO:** `join_waitlist` RPC assigns `position = max(position)+1` under the tier row lock (no collisions under concurrent joins); `requeue_waitlist_entry` sends expired offers to the true end; `offer_waitlist_next` orders by `position, created_at`; booking confirm clears the user's waitlist row.
- **`pgcrypto` — FIXED & applied (2025-09-22):** was in `schema.sql` but missing from `fix_all.sql`, and Supabase installs it to the `extensions` schema → PIN RPCs' `search_path = public` couldn't see `digest()`. Fix_all now creates the extension and all 4 PIN fns use `search_path = public, extensions`. Applied to live DB.
- **E2E harness (dev):** `node scripts/_seed_dev_test.mjs` seeds 5 users (`dev.{user,user2,user3,organizer,organizer2,admin}@outsiderr.test`, pw `DevTest#1234`) + org (KYC approved) + 4 events + tiers + PINs (scanner `123456`, box-office `654321`). `/dev-login` = one-click role login (404 in production). `node scripts/_e2e_dev_test.mjs [baseUrl]` runs 72 assertions end-to-end (idempotent — resets state; run against `next build`+`next start`, dev-mode compile stalls exceed the JWT TTL). Last run: **72/72 green** (auth, free RSVP + per-user cap, paid reserve→capture via apply_captured_payment, approve/reject on legacy pending rows, subscribe/follow, waitlist FIFO, scanner check-in, box-office, event lifecycle, burst no-oversell, reviews, cancel/refund, collab, clubs, postponement refund). Paid orders go through `create_reserved_order` + a simulated `apply_captured_payment` (service-role = webhook); the retired `/orders/manual` paid path is no longer exercised.
- **Security hardening (STEP 21-26, applied live):** anon revocation of priv-RPCs (`confirm_razorpay_order`, `create_walkin_order`, `fail_razorpay_order`, `offer_waitlist_next` …); column-level UPDATE grants on `profiles`/`organizers`/`events` (no self-`is_admin`, no self-KYC-approval, no fee edits); `organizers_public` view (PAN/bank no longer public); server-side money recompute in `create_paid_order`/`create_reserved_order`; webhook event/id parsing fixed (`payment.captured` top-level + `x-razorpay-event-id` header) + hero-boost fallback; refund sweep service; service-client for trusted mutations after app-level authz; `sendNotification` writes via service client (cross-user); enum values `ORDER_CONFIRMED`/`ORDER_REJECTED`/`HERO_BOOST` added; clubs insert policy outer-ref bug fixed; `approve_order` ticket minting restored; postponement-refund ambiguity + authz fixed; E2E verified exploits closed (anon confirm/walkin → 401, fake-paise order → server amounts).
- **E2E-found bugs fixed (2025-09-22):** (a) `pgcrypto` missing from `fix_all.sql` + installed to `extensions` schema → PIN RPCs' `search_path=public` couldn't see `digest()` — added `, extensions` to the 4 PIN fns' search_path. (b) `engagement.ts`/`reviews.ts`/`hero-boosts.ts` imported the **browser** client in server actions → `auth.uid()` null → subscribe/follow/review/hero-boost inserts were silently broken on web too — switched to `../auth/server`. (c) `.upsert()` on `event_subscriptions`/`organizer_follows` needed an UPDATE policy that doesn't exist → `ignoreDuplicates: true`. (d) `reject_order` allowed rejecting CONFIRMED orders + never restored inventory → restricted to PENDING_VERIFICATION; `rejectOrder` data fn back on the RPC. (e) `offer_waitlist_next` had no capacity check → phantom waitlist offers — added tier-lock + availability check. (f) `getCurrentUser` did a GoTrue roundtrip per API call → rate-limit flakiness — added bearer-identity cache (TTL ≤ token exp).
- **New column:** `events.teaser_video_url text` (optional organizer teaser, ≤10s, muted-autoplay on the discovery `EventCard`; cleared by `cleanup-teasers` after the event ends). Migration already appended to `fix_all.sql`.
- `wipe_all.sql` exists for clean resets (seeds commission tiers + auto-promote-first-admin trigger).
- Pre-existing build warnings (non-blocking): unused vars in `admin/events/page.tsx`, `organizer/events/[id]/page.tsx` (door-staff leftovers), `event-form.tsx`, `ticket-tiers.tsx` (`feeBps`); `useCallback` deps in `analytics-charts.tsx`; Sentry config deprecations.
- **2026-10-08 batch (committed + pushed):** (a) Organizer event edit = 8 collapsible sections w/ per-section save via `updateEventSectionAction` (scoped field overlay, per-section validation - no cross-section bleed); manage-page panels (collaborators, staff+scanner PINs, box-office PINs, boost, postpone/cancel) wrapped in `CollapsibleSection`. (b) Price-lock UX - `RazorpayCheckout` shows "Price & seats locked - expires in MM:SS" countdown to `reservation_expires_at`; the lock itself is the existing server-side fee snapshot in `create_reserved_order`. (c) Em/en dashes replaced with `-` across `src/` (802 lines). (d) Razorpay cancel → `abandon_payment` RPC releases held seats instantly (was: wait for TTL/cron). (e) Notification deep-links - order/refund → `/tickets`, venue/time/city change → event page, collab invite → `/organizer`, payout → `/organizer/payments`, admin queues → their `/admin/*`. (f) Admin fee edits (`commission_bps`/`convenience_fee_bps`) were silently blocked by RLS (no admin UPDATE on `events`) - now service-role writes with row-count check + surfaced errors; locked once `starts_at` passes. (g) `.npmrc` `legacy-peer-deps=true` fixes Vercel install failure (`@vercel/analytics` optional peers → `vite@8` vs vitest `vite@5` ERESOLVE). (h) Live phase transitions - `ticket-tiers.tsx` re-arms a timer to each `phase_opens_at`/`phase_closes_at`/`starts_at`/`ends_at` boundary so pricing flips without refresh. (i) Venue TBA in edit form (was hardcoded `NOW` + required maps link). (j) Client-side image compression (≤1 MB, 2048px) before poster/gallery upload - source-size rejection removed.
- **2026-10-08 batch 2 (committed + pushed):** (a) Organizer dashboard chrome - OrganizerChrome in /organizer layout renders header (avatar/bio/socials) above tab bar on all 6 dashboard pages; nav auto-hides on manage/scan/box-office. (b) All 28 loading.tsx unified to borderless BrandedPageLoader. (c) Admin /admin/organizers (Gold=Premium / Normal tabs) + /admin/organizers/[id] detail w/ PremiumAdminPanel - grant 3/6/12mo or revoke premium manually, every change written to admin_change_log with admin email + reason + audit trail shown. (d) Cities - City type now free-form; INDIAN_STATES_CITIES (~35 states/UTs, ~140 cities) drives CityPicker (State→City→Other-typed) on event create + edit-venue; club form uses datalist; location-selector has search/type-ahead + haversine nearest-city; cityLabel() for display; 90d/180d audience window by premium. (e) Latest Events on analytics page has a client-side search input. (f) Manage-event error page - dead Try again + misleading copy removed.
- **Pending:** gallery shuffle (create + edit), media replacement deletes old bucket asset, price-lock visualization on `/checkout` pre-Pay (lock currently starts at reservation creation - countdown shows once Pay clicked), Vercel `RAZORPAY_*` env vars, live ₹2,089 PENDING refund on DEVTEST Paid Jam (user decision: refund or rescue).

## Production launch checklist (outsiderr.in)

1. **Vercel** — New Project → import `geeknick09/outsiderr` → set env vars (below) → Deploy. `vercel.json` stays `{}`; domain already in `serverActions.allowedOrigins`.
2. **Domain** — Vercel → Domains → add `outsiderr.in` + `www.outsiderr.in`. DNS at registrar: `A @ → 76.76.21.21`, `CNAME www → cname.vercel-dns.com`.
3. **Env vars (Vercel Production):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL=https://outsiderr.in`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `CRON_SECRET`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (optional). (`SUPABASE_DB_PASSWORD` is script-only — not needed.)
4. **Supabase** — Dashboard → Authentication → URL Configuration: Site URL `https://outsiderr.in`; add redirect URLs `https://outsiderr.in/**` + `https://www.outsiderr.in/**` (keep `http://localhost:3000/**` for dev). Google OAuth callback stays `https://<project>.supabase.co/auth/v1/callback` — no Google-side change.
5. **Razorpay** — needs live keys (`rzp_live_*`, requires activated/KYC'd Razorpay account). Webhook → `https://outsiderr.in/api/razorpay/webhook`, events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`; secret = `RAZORPAY_WEBHOOK_SECRET`.
6. **GitHub repo secrets** — `CRON_SECRET` (same value as Vercel) + `APP_URL=https://outsiderr.in` → cron jobs go live (`.github/workflows/cron.yml`).
7. **First admin** — after your real account signs up once: `update profiles set is_admin = true where id = '<your-user-id>';`
8. **Cleanup** — DEVTEST seed data lives in the prod DB (4 users, 4 events, 2 PINs); remove before public launch or leave — they're clearly labeled.
9. **Post-deploy smoke** — `GET /api/health` → 200 · magic-link login roundtrip · one real checkout (small amount) → ticket in wallet · `workflow_dispatch` the cron once → check runs green.

## Staging setup (E11) — summary

Create `outsiderr-staging` Supabase project (same region) → run `schema.sql` + `fix_all.sql` → seed (`scripts/reseed.mjs` or manual) → Vercel Preview env vars pointing at staging + `rzp_test_` Razorpay keys → test webhook + separate `CRON_SECRET` → verify end-to-end → document promote path (merge→main→deploy→migrate prod).
- **Analytics schema separation (STEP 27, applied live):** `analytics.*` schema holds rollup tables (`daily_metrics`, `user_activity_days`, `user_order_stats`, `organizer_rollup`, `event_rollup`, `totals`); `refresh_analytics_rollups(90)` recomputes them hourly via `/api/cron/refresh-analytics` (GH Actions). Admin analytics reads now hit `public.analytics_*_v` views (service-role-only) instead of full-table scans — `getUserAnalytics`/`getPaymentAnalytics`/`getRevenueAnalytics` no longer pull all orders into memory. OLAP migration path: CDC/ETL to ClickHouse/BigQuery when Phase-4 campaign telemetry lands.
- **Analytics incremental refresh (STEP 28, applied live):** `refresh_analytics_rollups(p_days, p_full)` is watermark-incremental — only orders changed since `analytics.refresh_state.watermark` (created/confirmed/reviewed/refund-initiated) mark their days/users/events/orgs dirty; those entities re-aggregate wholesale so status flips stay correct. `?full=1` weekly rebuild = drift safety net. Verified by `scripts/_test_analytics_rollup.mjs` — **16/16** (create→refresh→approve→refresh→cancel→refresh lifecycle, idempotency, cron endpoint auth).
- **Notification outbox (STEP 29, applied live):** `notification_outbox` + `enqueue/claim/complete_notification_outbox` RPCs (service-role only) give external channels (push/email/whatsapp) a durable, crash-safe delivery path — sendNotification enqueues, `/api/cron/drain-notifications` claims (SKIP LOCKED) + retries with attempts² backoff, rows expire after 24h. Endpoint returns `skipped` until a provider env exists (EXPO_ACCESS_TOKEN/FCM_SERVER_KEY/WEB_PUSH_PRIVATE_KEY). GH Actions drains every 5 min. WAL/CDC map documented in architecture.md §6b (PITR trigger = first paid order; CDC→OLAP = Phase 4). Verified in `scripts/_test_analytics_rollup.mjs` T17–T21.
- **KYC UX fixes:** REJECTED state renders red "application not approved" (was stuck on "in progress"); realtime refresher mounted for pending/rejected pages (live admin decisions now land); withdraw-application action added (deletes org row + clears is_organizer, blocked when APPROVED/events exist); wizard gains optional PAN photo + bank proof uploads (2 MB cap); `updateOrganizerAction` now persists `kycResponseNote`/`kycResponseDocumentUrl`/doc URLs (were silently dropped); bell labels added for KYC/ORDER/COLLAB types. DB-probe verified 7/7 (create→reject→notif→resubmit-fields→withdraw→flag clear).
- **Admin pending-queue notifications (STEP 30, applied live):** new enum types + `notifyAdmins` helper — KYC submit/resubmit, slot-boost request, hero-boost UTR, and door-staff UTR all notify every admin's bell. Doc uploads capped at 1 MB. Verified 4/4 live (admin fan-out + enum round-trip).
- **Rejected-organizer UX:** navbar isOrganizer now driven by KYC access state (was profiles.is_organizer flag → rejected users saw "Organizer Dashboard"). `/list-your-event` shows a blocked panel ("rejected N times — contact support") once rejection_count >= organizer_rejection_limit (platform_settings, default 5) and swaps approved-user CTAs to "Go to Organizer Dashboard".
- **KYC review round 2 (STEP 31, applied live):** kyc_messages thread table + addKycMessage helper — admin decisions + organizer resubmits logged with sender email; admin card shows doc links + organizer response + full thread; filter tabs show per-status counts; KYC page gets a loading skeleton. Doc uploads switched to plain file input (no cropper, PDF ok) with inline >1 MB errors; response form gated to REJECTED/CLARIFICATION; clarification copy now directs organizer to the dashboard. Bell refetches on open; app scrolls to top on load/navigation. Probed 3/3 (thread write/read, anon denied).
- **2026-09-26 profile/KYC follow-up:** cropper is portaled to `document.body` to escape `.glass`/backdrop-filter containing blocks, with responsive crop area + viewport-capped panel for short screens. Organizer intent is now a separate `organizer_intent` column, excluded from `organizers_public`, shown in admin KYC; fix_all backfills existing combined descriptions and grants owner updates.
