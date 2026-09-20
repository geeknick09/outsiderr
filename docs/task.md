# Tasks — Outsiderr tracker

One-sentence purpose: the single source of truth for what is done, in progress, blocked, and planned — replaces `BACKLOG.md`.
Last updated: 2025-09-20

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
| R2 | `modules/scanner`: components/{scan,box-office}/, organizer/{door-scanner,event-door-scanner,walkin-checkin-form}, lib/offline/, actions: verifyScannerPinAction + check-in + box-office order actions | Not started | Smallest module — proves the pattern. |
| R3 | `modules/admin`: components/admin (minus analytics 3), data/{admin,legal-pages,kyc review fns}, actions/{admin,kyc,legal-pages, hero-boosts admin half} | Not started | Fixes smell: organizer pages stop importing admin — `listEventOrders/listEventTickets` move to shared/data. |
| R4 | `modules/organizer`: remaining components/organizer (~28), data/{organizer event-CRUD parts,event-staff,door-staff,scanner-pins,box-office-pins,kyc submit side}, collab half of engagement.ts, actions/{events,organizer,event-staff,door-staff,boosts,box-office,scanner-pins generate/revoke, engagement collab half, hero-boosts purchase half} | Not started | `lib/organizer-eligibility.ts` → `organizer/lib/` (used by its tests). |
| R5 | `modules/web`: components/{events,checkout,tickets,clubs,profile,reviews}/ + organizer/follow-button, data/{clubs,reviews, engagement web half, hero-boosts+boosts read side}, actions/{orders,clubs,reviews,waitlist, engagement web half} | Not started | Largest route surface: home, events, checkout, tickets, clubs, profile, organizers, legal, about, contact, login, list-your-event. |
| R6 | `modules/analytics`: organizer/{analytics-panel,aggregated-analytics}, admin/{analytics-charts(+lazy),user-analytics-export}; data fns: getOrganizerEventAnalytics + getOrganizerDailyRevenue (from organizer.ts), getEventAnalytics + getUserAnalytics + getPaymentAnalytics + getOrganizerAnalytics + getRevenueAnalytics (from admin.ts) | Not started | |
| R7 | `modules/campaigns`: README + types.ts + index.ts (no tables/UI — data model lives in prd.md §8) | Not started | |
| R8 | Enforce: legacy dirs deleted, ESLint legacy-path rule uncommented, boundary greps return 0, routes thin, codemod deleted, docs synced | Not started | Audit cmds: `find src/lib src/components src/actions -type f` → 0; `grep -rn "@/modules/\(web\|organizer\|admin\|scanner\|campaigns\)" src/modules/shared` → 0 |

---

## Phase 1 — MVP (Completed)

Grouped by domain. Full detail was in `BACKLOG.md` (now superseded); test cases in `docs/reference/test-scenarios.md`.

| Area | Items shipped | Status |
|---|---|---|
| Events | create/edit (map picker, GMaps link, tags), FREE/FLAT/PAID + multi-tier, phased flat pricing, poster+gallery (≤8 photos), TBA venue, contact details, linked past editions, past-event handling, Gaming category + "Alternate Sports & Fitness" | Completed |
| Users | profile (name/birthdate/phone/interests), tag auto-merge on booking, dynamic organizer label in menu | Completed |
| Organizer | onboarding + 5-step KYC (PAN/GST/bank/UPI/agreement), profile edit + cover, dashboard, event mgmt, T&C versioning | Completed |
| KYC review | `/admin/kyc` approve/reject/clarify + bell notifications + status banner + rejection cap (`organizer_rejection_limit`, default 5) + resubmission | Completed |
| Booking | Razorpay checkout + webhook + legacy manual UPI/UTR, free tickets, waitlist, refundable flows | Completed |
| Tickets | QR wallet, expandable cards, expired state, print, walk-in (3 modes), box-office | Completed |
| Scanner | per-event PIN (hashed, rate-limited, staff name+email+phone), offline queue sync, per-event check-in | Completed |
| Engagement | Update-Me subscriptions, follow organizers (display-only), co-organizer collab w/ 4 permission tiers | Completed |
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
| `sendNotification(user,type,data)` abstraction | Not started | — | P11/P12/P13 base |
| Email/SMS/WhatsApp providers | Not started | provider accounts | behind abstraction |
| Staging env (E11) | Not started | manual Supabase+Vercel setup | steps preserved below |
| Vercel cron config | Not started | domain/cron secret | `/api/cron/expire-reservations` (1/min), `/api/cron/backup` |
| Production hardening & QA pass | In progress | — | run `docs/reference/test-scenarios.md` |

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

## Phase 4 — Campaigns MVP (planned)

| Task | Status | Remarks |
|---|---|---|
| Schema: `campaigns`, `campaign_links`, `click_events`, `attributions` | Not started | model in prd.md §8 |
| `/c/[slug]` redirect + click logging + `oc_<c>` cookie | Not started | server-side count, hashed IP/UA |
| Attribution on `confirm_*_order` (last-touch default) | Not started | |
| Organizer "Campaigns" tab + admin roll-up | Not started | |

## Phase 5 — Vision roadmap (from PRODUCT_VISION.md; pointers only, not implementation tasks)

Scene graph model · experience types beyond events (cyphers/sessions/battles/jams) · artist/rider profiles · Outsider Score reputation · crew-vs-crew · crew content/history · places as first-class objects + discovery · culture feed (scene-linked, NOT generic social) · experience-linked content + clips (+ video embeds, video cards need media pipeline) · scene-based home screen + "Happening Now" · organizer identity types (crew/artist/venue/brand) · Outsiderr Originals · battle mechanics + challenges · follow-everything + participation history · sponsorship/campaign framework · merch & drops · premium organizer SaaS · keep categories narrow (authenticity over scale).

---

## Known issues / action required

- **Migrations:** all pending SQL lives in `supabase/migrations/fix_all.sql` — run `node scripts/_apply_fix_all.mjs`. Last applied to live DB: 2025-09-20 (includes scanner `staff_email`/`staff_phone`, `organizers.kyc_*`, KYC notification enum values, `event_notifications.event_id` now nullable, `generate_scanner_pins` 4-arg signature — old 2-arg overload was dropped).
- **Env vars to set:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (`.env.example`).
- **Razorpay webhook:** `https://<domain>/api/razorpay/webhook`, subscribe `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`.
- **Vercel cron:** `GET /api/cron/expire-reservations` w/ `Authorization: Bearer <CRON_SECRET>` every minute.
- `wipe_all.sql` exists for clean resets (seeds commission tiers + auto-promote-first-admin trigger).
- Pre-existing build warnings (non-blocking): unused vars in `admin/events/page.tsx`, `organizer/events/[id]/page.tsx` (door-staff leftovers), `event-form.tsx`, `ticket-tiers.tsx` (`feeBps`); `useCallback` deps in `analytics-charts.tsx`; Sentry config deprecations.

## Staging setup (E11) — summary

Create `outsiderr-staging` Supabase project (same region) → run `schema.sql` + `fix_all.sql` → seed (`scripts/reseed.mjs` or manual) → Vercel Preview env vars pointing at staging + `rzp_test_` Razorpay keys → test webhook + separate `CRON_SECRET` → verify end-to-end → document promote path (merge→main→deploy→migrate prod).
