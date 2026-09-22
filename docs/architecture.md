# Architecture — Outsiderr

One-sentence purpose: how the system is laid out, how the pieces connect, and the path to splitting into separate apps.
Last updated: 2025-09-22

## 1. System overview

```
Browser / PWA                          React Native apps (future: user, organizer, scanner)
   │  (Next.js App Router, Vercel)            │  (fetch /api/v1/* + supabase.rpc direct)
   ▼                                         ▼
src/middleware.ts ──► src/app/** (thin routes) ──► src/app/api/v1/* (thin REST routes)
                         │                              │  withApiUser (Bearer JWT) / PIN auth
                         ▼                              ▼
              src/modules/<domain>/server.ts  (data access, "server-only")
              src/modules/<domain>/actions/*  ("use server" mutations — web only)
              src/modules/shared/services/*   (orchestration shared by actions + routes)
                         │
                         ▼
              Supabase (Auth + Postgres + RLS + RPCs + Storage + Realtime)

External:
  Razorpay ──webhook──► /api/razorpay/webhook
  GitHub Actions cron ──Bearer CRON_SECRET──► /api/cron/* (see .github/workflows/cron.yml)
  Supabase Realtime (postgres_changes) ──► lib/hooks/use-realtime
  Sentry (errors) · Pino (structured logs) · Storage buckets (posters, covers, backups)
```

## 2. Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15.5.23 App Router, React 19, TypeScript |
| DB / Auth / Realtime / Storage | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) |
| Payments | Razorpay (checkout + webhook); legacy manual UPI+UTR retained |
| Styling | Tailwind CSS (v3, `darkMode: "class"`) + custom utilities |
| Validation | Zod (`src/lib/validation.ts` → `modules/shared/lib`) |
| Tests | Vitest (`tests/`, 6 suites) |
| Obs. | Sentry (`@sentry/nextjs`), pino logger with secret redaction |
| Misc | `html5-qrcode` (scanning), `qrcode`, `react-leaflet` (maps, `ssr:false`), `recharts`, `jspdf`, `next-themes`, `pg` (migration scripts) |

## 3. Folder structure

Single Next.js app organized into **domain modules**. Each module maps 1:1 to a future standalone app.

```text
outsiderr/
├── AGENTS.md                 # pointer → docs/rules.md
├── PRODUCT_VISION.md         # product constitution (read first for product calls)
├── README.md
├── docs/                     # knowledge base (prd, architecture, rules, design, task, memory)
│   └── reference/            # long-form docs (test-scenarios, qa-report, api-spec, plans)
├── supabase/                 # schema.sql (canonical), migrations/fix_all.sql (idempotent)
├── scripts/                  # one-off migration/check/seed .mjs scripts (use `pg`, not supabase-js)
│                             #   + _seed_dev_test.mjs (dev fixtures) + _e2e_dev_test.mjs (48-assert API e2e)
├── tests/                    # Vitest suites + fixtures
└── src/
    ├── middleware.ts
    ├── app/                  # THIN ROUTES ONLY — guard + fetch via module server API + render
    │   ├── api/v1/*          # REST surface for mobile/third-party (see §4a)
    │   └── dev-login/        # dev-only role login (404 in production)
    └── modules/
        ├── shared/           # → future packages/* : ui, core data, auth, db types, lib, hooks
        │                     #   + services/ (orchestration), api/client.ts (portable typed client),
        │                     #   notifications.ts (sendNotification channel abstraction)
        ├── web/              # → apps/web : discovery, event page, checkout, tickets, clubs, reviews, profile
        ├── organizer/        # → apps/organizer : dashboard, event CRUD, KYC submit, collab, staff, PIN mgmt
        ├── admin/            # → apps/admin : moderation, KYC review, settings, legal, users, revenue views
        ├── scanner/          # → apps/scanner : PIN login, door scanner, offline sync, box office, walk-in
        ├── analytics/        # → apps/analytics : organizer + admin analytics components & queries
        └── campaigns/        # → apps/campaigns : stub — types + README only (see prd.md §8)
```

### Per-module contents (as built)

| Module | `components/` | `data/` | `actions/` | other |
|---|---|---|---|---|
| `shared` | `ui/{ui,layout,theme,pwa,auth,community,payment}` | events, orders, event-orders, tickets, organizers, organizer-profile, profile, platform-settings, notifications, waitlist, clubs, reviews, engagement, door-staff, scanner-pins, box-office-pins, boosts, hero-boosts | auth, profile, notifications, push, clubs, engagement, hero-boosts, reviews | `auth/` (client/server/service/middleware/config/api-context/bearer), `services/` (orders orchestration), `api/client.ts` (portable client), `notifications.ts` (sendNotification), `db/database.types`, `lib/` (20 utils), `hooks/` |
| `web` | `{events,checkout,profile,reviews,tickets}` + follow-button, join-club-form | — | orders, waitlist | — |
| `organizer` | 28 dashboard/event/staff/KYC/boost/collab components | organizer-events, event-staff | organizer, events, event-staff, door-staff, boosts, order-verify, scanner-pins, box-office-pins | — |
| `admin` | 9 (event-edit, kyc-review, settings, legal, boosts, slot-price, bulk-approve) | admin, kyc, legal-pages | admin, kyc, legal-pages | — |
| `scanner` | `{scan,box-office}` + door-scanner, event-door-scanner, walkin-checkin-form | — | scan, check-in, box-office | `offline/` (scanner-db, sync-manager) |
| `analytics` | analytics-charts(+lazy), user-analytics-export, analytics-panel, aggregated-analytics | organizer-analytics, admin-analytics | — | — |
| `campaigns` | — | — | — | `types.ts` (stub) |

### Module public API convention

Each module exposes only these entry points; everything else is private:

| Entry | Contents | Importable from |
|---|---|---|
| `modules/<m>/index.ts` | components, types, constants, pure helpers | anywhere (client or server) |
| `modules/<m>/server.ts` | data-access (files with `import "server-only"`) | Server Components, actions, route handlers |
| `modules/<m>/actions/<file>.ts` | `"use server"` functions — imported by direct path | anywhere (Next RPC boundary) |
| `modules/<m>/README.md` | scope, owns/uses list | docs only |

**Never import deep internals** (`@/modules/x/components/*`, `@/modules/x/data/*`) from another module. Never import `@/lib/*`, `@/components/*`, `@/actions/*` — those dirs are gone after Phase R.

### Dependency direction

```
web ──┐
organizer ┼─► shared ◄─ analytics
admin ──┤        ▲
scanner ─┘        │   (organizer + admin may import analytics index/server)
campaigns ────────┘
web ✗ organizer · web ✗ admin · admin ✗ organizer
```

`shared` contains **no business rules** — only primitives (types, constants, UI, auth, db clients, logging, validation, core entities used by ≥3 modules: events, orders, tickets, organizers, profiles, platform settings, notifications).

## 4. Key request flows

**(a) Public event page (read)**
`app/events/[id]/page.tsx` → `modules/web/server` `getEvent(id)` → Supabase (RLS: published/postponed readable) → render `modules/web` components. Dynamic (`force-dynamic`); never cached for correctness.

**(b) Organizer creates event (write)**
`app/organizer` create tab → `modules/organizer/actions/events.ts#createEventAction` → Zod validate → organizer ownership + KYC/eligibility check → Supabase insert (RLS `organizer_id = my org`) → `revalidatePath("/organizer")` + `revalidateTag("events")`.

**(c) Door scan (public, no login)**
`app/scan` → `verifyScannerPinAction(eventId, pin)` → rate-limit (20/min/IP) → RPC `verify_scanner_pin` (SHA-256 `event_id:pin` hash compare) → session UI. Scan QR → `checkInWithPin` → RPC `check_in_ticket_with_pin` → atomic VALID→USED; `ALREADY_USED` is treated as success by offline sync queue.

**(d) API request (mobile/third-party)**
`POST /api/v1/<resource>` → `withApiUser(request, handler)` extracts `Authorization: Bearer <supabase-jwt>` into an `AsyncLocalStorage` context → `createClient()` inside any data fn/RPC resolves to a bearer-token client → identical RLS/`auth.uid()` behavior to a cookie session. Scanner/box-office routes use PIN-in-body instead (rate-limited). Response envelope: `{ ok: true, data }` | `{ ok: false, error }`. Contract: `GET /api/openapi.json` (Swagger UI at `/api-docs`).

### 4a. API vs server action split (rule)

- **Secrets or multi-step orchestration** (Razorpay create/verify, refunds, manual-order approve) → `/api/v1/*` route calling `shared/services/*` — never a server action, never in the client bundle.
- **Thin single-RPC ops** (join waitlist, check-in, subscribe) → mobile calls `supabase.rpc(...)` directly; RLS + `auth.uid()` are the authorization. The API mirrors these only where a uniform envelope helps.
- Web UI keeps using server actions — both paths share the same `services/*`/`data/*` cores, so behavior can't diverge.
- Every route: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, zod-validated body, envelope helpers `apiOk`/`apiError`/`readJson` in `modules/shared/lib/api.ts`.

## 5. Auth & authorization

- Sessions: Supabase Auth — cookies via `@supabase/ssr` for web; **`Authorization: Bearer` JWT for `/api/v1`** (`modules/shared/auth/*`: `server.ts`, `client.ts`, `service.ts`, `middleware.ts`, `config.ts`, `api-context.ts`, `bearer.ts`).
- `createClient()` in `auth/server.ts` prefers the ALS bearer token (`getApiContextToken()`) when set by `withApiUser`/`withApiContext`, else cookies — so every data fn works unchanged for both transports.
- `getCurrentUser()` caches GoTrue-verified bearer identities keyed by JWT (TTL ≤ token `exp`) — prevents `/auth/v1/user` rate-limit flakiness; PostgREST still signature-verifies every DB call, so the cache is identity fast-path only.
- Roles/flags: `profiles.is_admin`, `profiles.is_organizer`, `organizers.kyc_status` (`NOT_SUBMITTED|PENDING|APPROVED|REJECTED|CLARIFICATION_NEEDED`) + `rejection_count` vs `platform_settings.organizer_rejection_limit`.
- Co-organizer tiers: `event_collaborators.permission_level` (`VIEW_ONLY|ANALYTICS|SCAN|FULL`) — helpers `getEventAccessLevel`, `can*` in organizer data layer.
- Door staff: `event_staff` rows (login-free), or `scanner_pins`/`box_office_pins` (hashed PINs, per-event).
- Admin gate: strict `is_admin === true` — no zero-admin fallback (`requireAdmin()` in `modules/admin/actions`).
- Dev-only login: `/dev-login` (404 in prod) + `scripts/_seed_dev_test.mjs` — real `signInWithPassword` sessions for the 4 seeded roles, no auth bypass.
- **Gotcha:** server-side files must never import `auth/client` (browser/anon singleton → `auth.uid()` = null → RLS writes silently fail). Three action files had this bug; check imports when creating actions.

## 6. Database

- Canonical schema: `supabase/schema.sql`. Incremental/idempotent: `supabase/migrations/fix_all.sql`.
- Apply with `node scripts/_apply_fix_all.mjs` (reads `SUPABASE_DB_PASSWORD`/`SUPABASE_DB_URL` from `.env`, uses `pg`). **Use `pg`, never supabase-js, in scripts** — Node 21 lacks native WS for realtime init.
- DB change checklist: ① schema.sql ② `alter table ... if not exists` in fix_all.sql ③ `database.types.ts` ④ note in `docs/task.md` Known Issues.
- Key RPCs: `create_paid_order`, `confirm_razorpay_order`, `fail_razorpay_order`, `create_reserved_order`, `expire_reserved_orders`, `create_walkin_order` (+`update_walkin_order`), `check_in_ticket`, `check_in_ticket_with_pin`, `cancel_event`, `postpone_event`, `request_postponement_refund`, `verify_scanner_pin`, `generate_scanner_pins` (4-arg version incl. `p_staff_emails`/`p_staff_phones`), `revoke_scanner_pin`, `verify_box_office_pin`, `generate_box_office_pins`, `revoke_box_office_pin`, `approve_order`, `reject_order` (PENDING_VERIFICATION only — CONFIRMED goes through refund), `join_waitlist` (atomic `max(position)+1` under tier lock), `offer_waitlist_next` (tier-locked capacity check + FIFO), `requeue_waitlist_entry`, `is_event_staff`, `is_door_staff_any`, `get_staff_organizer_ids`.
- Financial source of truth = DB; money in paise; fee snapshots per order; no hard deletes on financial tables.
- **pgcrypto:** Supabase installs it in the `extensions` schema — `security definer` functions need `set search_path = public, extensions` to see `digest()`. All 4 PIN RPCs carry this; keep it when adding new ones.
- **`.upsert()` + RLS:** `onConflict` emits `ON CONFLICT DO UPDATE` → needs an UPDATE policy. For write-once join rows (`event_subscriptions`, `organizer_follows`) use `ignoreDuplicates: true` instead.

## 7. Caching & realtime

- Home page: ISR `revalidate = 60`; event mutations call `revalidateTag("events")`.
- Realtime publication: `event_notifications`, `events`, `event_subscriptions`, `organizer_follows`, `event_collaborators`, `scanner_pins`, `box_office_pins`, `event_reviews`, `event_staff`, `orders`, `tickets` (per schema).
- Client hook: `useRealtime({channelName, table, event, filter, onPayload})` (postgres_changes).

## 8. Observability

- Sentry: `instrumentation.ts`, `sentry.*.config.ts` — no-ops without `SENTRY_DSN`. Known warnings: rename client config → `instrumentation-client.ts`, add `onRequestError`.
- Logs: `pino` JSON in prod, pino-pretty dev; auto-redacts passwords/tokens/signatures. `logger.logError` also reports to Sentry.
- Health: `GET /api/health`. API docs: `GET /api/openapi.json` + Swagger UI at `/api-docs`.
- Notifications: `sendNotification({ userId, eventId?, type, title, body, channels })` in `modules/shared/notifications.ts` — `in-app` writes `event_notifications`; `push`/`email`/`whatsapp` are scaffolded channels (push resolves subscriptions; provider send lands with Expo/FCM). Never throws — failures can't break core flows.

## 9. Future split path (modular monolith → apps/*)

**Mobile (React Native/Expo — decided, not Capacitor):** 3 apps — `outsiderr` (user), `organizer`, `scanner`. Admin stays web-only. The `/api/v1` surface + `supabase.rpc` + `shared/api/client.ts` (`createOutsiderrClient`) are the whole contract — the RN work is ~90% UI. See `docs/mobile.md` for the endpoint inventory and `packages/{api-client,types,utils}` plan.

1. Add turborepo + pnpm workspaces; `modules/shared` → `packages/{ui,shared,db,auth}`; each `modules/<m>` → `apps/<m>` with its own `next.config`, Tailwind config, and Vercel project.
2. Auth across apps: cookie domain `.outsiderr.com` so Supabase session spans subdomains; `/scan` can stay public-PIN (no cookie needed).
3. Because all cross-module imports already go through `index/server/actions`, the lift is mechanical: move folder, fix `@/modules/x` → `@outsiderr/x` alias, add app shell.
4. What would break the path (don't do): deep imports into another module, business rules in `shared`, client components importing `server.ts`, routes reaching into `data/*` directly.

## 10. Known environment constraints

- Local Node 21: no native `WebSocket` → realtime init crashes in node scripts; use `pg`.
- Windows: `.next/trace` EPERM when a stale node process holds it → kill node, delete `.next`, rebuild.
- Full `next build` is slow (2–5 min) — use `tsc --noEmit` mid-task, full build at phase end.
- Cron runs via GitHub Actions (`.github/workflows/cron.yml`) — needs repo secrets `CRON_SECRET` + `APP_URL`. Schedules: reservations+waitlist offers `*/5min`, daily backup `02:00`, teaser cleanup `02:30`, weekly backup `Sun 03:00`. Jobs are gated by `github.event.schedule` (each fires only on its own cron).
