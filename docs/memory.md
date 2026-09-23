# Memory — decisions, bugs & fixes log

One-sentence purpose: append-only knowledge so agents never re-derive a past fix — check here before debugging.
Format: `Date · Area · What happened/decision → Fix/rule · Files`. Newest entries go on top.
Last updated: 2025-09-22

## 2025-09-22 — E2E harness + production bugs surfaced

- **E2E harness** — `scripts/_seed_dev_test.mjs` (4 dev users + org + events + PINs via service role; password `DevTest#1234`), `/dev-login` page (404 in prod — real `signInWithPassword` sessions, no auth bypass), `scripts/_e2e_dev_test.mjs` (48 assertions vs live server; idempotent — wipes test state each run). Rule learned: `admin.from().delete()` returns a thenable **without `.catch`** — wrap in try/catch.
- **Browser client in server actions (real prod bug)** — `engagement.ts`, `reviews.ts`, `hero-boosts.ts` imported `createClient` from `../auth/client` (browser/anon, singleton) → in server actions `auth.uid()` is null → subscribe/follow/review/hero-boost RLS writes silently failed **on web too**. Fixed → `../auth/server`. Rule: server-side files must never import `auth/client`.
- **`.upsert()` + RLS** — `upsert(onConflict)` emits `ON CONFLICT DO UPDATE` → requires an UPDATE policy; `event_subscriptions`/`organizer_follows` have insert+delete only → every subscribe/follow was rejected. Fix: `ignoreDuplicates: true` (DO NOTHING). Alternative: add UPDATE policies. Prefer ignoreDuplicates for write-once join rows.
- **pgcrypto schema visibility** — extension lives in `extensions` schema (Supabase convention), so `security definer` fns with `set search_path = public` can't see `digest()` → all `verify_*_pin`/`generate_*_pins` RPCs were broken on DBs built via fix_all. Fix: `set search_path = public, extensions`. (`check_in_ticket_with_pin` survived because it compares plaintext `pin_code`.)
- **`reject_order` was dangerous** — allowed rejecting CONFIRMED orders (real money!) via a bare status flip, never restored `quantity_sold`, and fired a waitlist offer for a seat that wasn't free. Now: RPC-restricted to `PENDING_VERIFICATION`; `rejectOrder` data fn uses the RPC again.
- **`offer_waitlist_next` capacity guard** — it offered regardless of stock → phantom offers. Now locks the tier row and returns null unless `quantity - sold - reserved > 0`. Also: PostgREST serializes a `returns table_type` null as `{id:null,...}`, not literal `null`.
- **GoTrue rate-limit flakiness** — every API route did `auth.getUser()` → `/auth/v1/user` per request; rapid bursts → intermittent 401s. Fix: bearer-identity cache in `getCurrentUser` (keyed by JWT, TTL ≤ token exp — PostgREST still signature-verifies every query, so it's only an identity fast-path).

## 2025-09-21 — Phase M1/M2/M4/M5 (mobile-ready API surface)

- **Bearer auth via AsyncLocalStorage (decision)** — `/api/v1/*` routes wrap handlers in `withApiUser(request, fn)` which stores `Authorization: Bearer <supabase-jwt>` in an ALS context (`shared/auth/api-context.ts`). `createClient()` checks that context first and returns a bearer-scoped supabase-js client (`auth/bearer.ts`) — so every data fn, `getCurrentUser()`, RLS policy, and `auth.uid()` RPC behaves exactly like a cookie session with ZERO refactor of the data layer. Cookie path is the fallback (web unchanged).
- **Server actions callable from routes** — plain-arg, non-redirecting actions (subscribe/follow/collab/pins/staff/check-in) are invoked directly inside `withApiContext` — the bearer context resolves `getCurrentUser()` inside them. FormData/redirect actions are NOT callable from routes — their orchestration was extracted to `shared/services/orders.ts` (runCheckout/runVerifyPayment/runPaymentFailure/runManualCheckout/runPostponementRefund) shared by both surfaces.
- **Envelope** — `{ ok: true, data }` | `{ ok: false, error }` via `shared/lib/api.ts` (`apiOk`/`apiError`/`readJson`/`withApiUser`/`withApi`).
- **sendNotification abstraction** — `shared/notifications.ts`; channels in-app (event_notifications) + push/email/whatsapp stubs. Never throws. All raw `event_notifications` inserts migrated (kyc ×3, collab ×2, waitlist offer, event-update bulk).
- **api-client seed** — `shared/api/client.ts` (`createOutsiderrClient`), pure TS no next imports → future `packages/api-client` for the RN apps.
- **pgcrypto gap found via smoke test** — `digest()` missing on incremental DBs (extension was in `schema.sql` but not `fix_all.sql`) → PIN verify RPCs failed. Added `create extension if not exists pgcrypto` to `fix_all.sql`.

## 2025-09-20 — Phase R (domain-module restructure)

- **Repo · R0+R1 landed** — `src/modules/{shared,web,organizer,admin,scanner,analytics,campaigns}` created; `src/{lib,components,actions}` being drained into them. Public API per module: `index.ts` (client-safe) / `server.ts` (`import "server-only"`) / `actions/*` / `auth/middleware` (edge-safe direct path). Import rule: intra-module = RELATIVE paths only (barrels would create cycles); cross-module = `@/modules/<m>` public entry. Enforced by ESLint `no-restricted-imports` (deep internals banned); direction checked by greps in R8.

- **Tooling · `server-only` + vitest** — `import "server-only"` throws under vitest (no RSC split). Barrel `index.ts` re-exporting client components that import `"use server"` action files pulls `server-only` transitively → all tests failed. Fix: `vitest.config.ts` aliases `server-only` → `tests/stubs/empty.ts`. Harmless (Next still enforces the real boundary at build).

- **Codemod · `scripts/_rewrite_imports.mjs`** — rewrites `@/lib|components|actions/*` → `@/modules/*`. Handles: whole-file moves (MOVE map), symbol-level routing for split files (SYMBOL_ROUTES: organizer.ts, admin.ts, kyc.ts, auth.ts), destructured dynamic imports `const {x}=await import(...)`, and type-position `import("@/...").Type`. Same-module → relative; cross → public entry. Run from repo root after each move phase.

- **Data-layer ownership (decision)** — entity data used by ≥2 sibling apps lives in `shared/data` (becomes `packages/db` on split): events, orders, organizers, organizer-profile, profile, platform-settings, notifications, waitlist, clubs, reviews, engagement, door-staff, scanner-pins, box-office-pins, boosts, hero-boosts, event-orders, tickets. App-specific queries stay in `<module>/data`: organizer-events + event-staff (organizer), admin + kyc + legal-pages (admin), organizer-analytics + admin-analytics (analytics). This fixed the smell where organizer pages imported `@/lib/data/admin` — `listEventOrders`/`listEventTickets` now in `shared/data` (no admin guard, RLS-scoped).

- **Splits** — `lib/data/organizer.ts` → `shared/data/organizer-profile.ts` (get/create/updateOrganizerProfile + Organizer/CreateOrganizerInput/UpdateOrganizerInput) + `organizer/data/organizer-events.ts` (event CRUD/lists) + `analytics/data/organizer-analytics.ts`. `lib/data/admin.ts` → `admin/data/admin.ts` (CRUD/stats/lists) + `analytics/data/admin-analytics.ts` (all *Analytics fns) + `shared/data/event-orders.ts`+`tickets.ts`.

- **Repo · Placeholder monorepo removed** — untracked `apps/` + `packages/` stub folders deleted; target structure lives in `docs/architecture.md` §3.

- **Repo · R7+R8 landed** — `modules/campaigns` stub (types.ts + README, contract for ad-click/attribution — no live tables/UI yet). Boundary enforcement ON: `eslint.config.mjs` bans legacy `@/{lib,components,actions}/*` AND deep internals `@/modules/*/{components,data,lib,ui,hooks,offline}/*`, plus per-module direction overrides (shared imports no sibling; analytics/web/scanner → shared only; organizer/admin → shared+analytics). `src/{components,actions,lib}` deleted. Migration codemods removed.

- **Codemod · `scripts/_rewrite_imports.mjs` (deleted after R8)** — lesson: `node -e "..."` inline scripts with JS template literals get their `${}` mangled by bash → wrote corrupt `;` lines. Fixed by writing `.mjs` files instead of inline eval, and restoring corruption via `git checkout HEAD --`. A follow-up `scripts/_fix_self_imports.mjs` (deleted too) converted intra-module `@/modules/<self>` imports to relative paths to kill barrel self-cycles.

- **RazorpayCheckout layering** — moved to `shared/ui/payment` (used by web checkout + organizer boost). Its `verifyAction`/`failureAction` are now REQUIRED props (dependency injection) — removed the internal `import("@/actions/orders")` default so shared never reaches into web. Caller injects the domain action (hero-boost-panel → boost actions; future order checkout → `@/modules/web/actions/orders`).

- **DB · `event_notifications.event_id` was `NOT NULL`** — KYC/collab-less notifications have no event → insert failed. Fix: `alter column event_id drop not null` in `fix_all.sql`; schema updated. Table has `message` (no `title` column) — notification UI derives its label from `TYPE_LABELS[type]` in `notification-bell.tsx`.

- **DB · Postgres function overload trap** — `create or replace function generate_scanner_pins(uuid, text[], text[], text[])` did NOT remove the old `(uuid, text[])` signature → two overloads, ambiguous calls. Fix: `drop function if exists public.generate_scanner_pins(uuid, text[])` before the create (now in `fix_all.sql`).

- **DB · `generate_scanner_pins` v2** — accepts `p_staff_emails text[]`, `p_staff_phones text[]` (parallel arrays to `p_staff_names`, `{}` default); writes `staff_email`/`staff_phone` columns on `scanner_pins`.

## Earlier (pre-docs migration)

- **Supabase types · manual `database.types.ts` doesn't expose FK relations** — nested selects like `select("*, organizer:organizers(name)")` fail typecheck → use separate queries + `Map` lookup. Files: `lib/data/engagement.ts` (rewritten this way).

- **Schema · organizers uses `avatar_url`**, not `photo_url`. A join on `photo_url` silently returned nothing.

- **Env · Node 21 lacks native WebSocket** — `supabase-js` realtime init crashes in `scripts/*.mjs` → all migration/check scripts use `pg` with `SUPABASE_DB_URL`/`SUPABASE_DB_PASSWORD` from `.env`.

- **Windows · `.next/trace` EPERM** — a stale `node` process locks the file between builds → `powershell Stop-Process -Name node -Force; Remove-Item -Recurse .next` then rebuild.

- **Notifications · price-only edit fired TIME_CHANGE** — event-diff notify compared all fields → compare only schedule fields (venue/city/time) before inserting notifications. Files: `lib/data/organizer.ts` (`updateEvent`), `actions/events.ts` merge ticket-holders + Update-Me subscribers before insert.

- **Leaflet · `window is not defined`** — `React.lazy(() => import("react-leaflet"))` breaks SSR → always `next/dynamic({ ssr: false })` for browser-only libs (MapPicker, html5-qrcode scanner).

- **Perf · `backdrop-blur-md` on every `.glass` card = scroll jank** on low-end phones → `.glass` uses `backdrop-blur-sm`. Files: `globals.css`.

- **UX · global `scroll-behavior: smooth` fights App Router** scroll restoration → never set it globally; apply inline where needed. Files: `globals.css` (documented in comment).

- **Collab · permission tiers** — `VIEW_ONLY` dashboard+read · `ANALYTICS` +analytics/orders · `SCAN` +scan/check-ins · `FULL` all-but-delete. Owner-only: delete event, manage collaborators, change tiers. Helpers: `getEventAccessLevel`, `can*` in `lib/data/engagement.ts`.

- **Financial invariants** — buyer `subtotal + convenience_fee`; organizer `subtotal − commission`; platform `commission + convenience_fee`; walk-in/box-office `convenience_fee = 0`. Snapshots on `orders`: `commission_paise`, `convenience_fee_paise`, `organizer_payout_paise`. Tests: `tests/financial.test.ts` (canonical 10×₹450).

- **PINs · stored hashed** — SHA-256(`event_id:pin`) in `pin_hash`; verify RPCs hash-and-compare; plaintext only exists in the organizer's generated-PIN display; unique index on `pin_hash`.

- **Idempotency** — `orders.idempotency_key` unique partial index; `create_walkin_order(p_idempotency_key)` returns existing row; offline sync treats `ALREADY_USED` as success (removes from queue). Files: `lib/offline/sync-manager.ts`.

- **Admin auth · strict `is_admin === true`** — the old "no admins exist → everyone is admin" fallback was removed. `requireAdmin()` throws for non-admins.

- **KYC gating** — organizer access requires `kyc_status = APPROVED`; `rejection_count` ≥ `platform_settings.organizer_rejection_limit` (default 5) permanently blocks re-entry; rejected-but-under-cap users can resubmit. Eligibility logic in `lib/organizer-eligibility.ts`.

- **Categories** — `FITNESS` label renamed "Alternate Sports & Fitness"; `GAMING` added (enum value + tags). Keep categories narrow per vision (V23).

- **Follows are display-only** — `organizer_follows` + follower count; deliberately NO feed/notifications (product decision). Event notifications merge Update-Me subscribers + ticket holders.

- **Hero boost** — 7-day duration, eligibility = ACTIVE + not expired + event published + not started + not cancelled; deterministic `rotation_index = floor(now/interval)`; `?source=HERO_BOOST` tracking param on carousel links.

- **Build log files** — `build-log.txt`/`buildlog.txt` were accidentally generated outputs, deleted (they were untracked junk).

## Standing gotchas

- `src/app` routes must stay thin; business logic goes in `modules/<domain>/`.
- `import "server-only"` in every data file; keep it OUT of module `index.ts` (put it behind `server.ts`) or client components break.
- Dynamic `import("@/components/...")` string paths don't get caught by simple import rewrites — grep `import(` after moves.
- Supabase `create or replace function` never drops the old signature (see overload trap above).
- `.env` keys for scripts: `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL` — NOT `DATABASE_URL`.

## QA hardening pass (STEP 21-26 in fix_all.sql + schema.sql)

- **Column-level privileges replace broad UPDATE grants** — `profiles`, `organizers`, `events` now grant UPDATE only on safe columns; privileged writes (`is_admin`, `kyc_status`, `verified`, `rejection_count`, `status`, `organizer_id`) go through security-definer RPCs (`submit_kyc`, `set_event_status`) or service client (admin paths, after `requireAdmin`).
- **`organizers` base table is no longer public** — public reads go through `organizers_public` view (includes `upi_id` for manual-checkout display; excludes PAN/bank/KYC). Owner/admin read the base table via policies.
- **Money fields are recomputed server-side** — `create_paid_order`/`create_reserved_order` ignore caller-supplied paise values and compute from tier price + event fee config (`commission_bps`, `convenience_fee_bps`). Never trust client money params.
- **Priv-RPC revocations** — `confirm_razorpay_order`, `fail_razorpay_order`, `create_walkin_order`, `update_walkin_order`, `approve_order`/`reject_order` + others are service-role-only; `approve_order`/`reject_order` keep `authenticated` grant but enforce `is_event_manager` inside. Legit callers in `data/orders.ts` etc. use `createServiceClient()` AFTER app-level authz (signature/PIN verified first).
- **`is_event_manager` vs `is_event_staff`** — manager = owner/admin/FULL collaborator; staff (door) can't approve/reject orders or change event state.
- **RLS gotcha — unqualified outer refs**: `exists (select 1 from organizers o where o.id = owner_id ...)` resolves `owner_id` to `o.owner_id` when the inner table has that column — silently wrong (broke clubs insert for everyone). Always qualify outer refs (`clubs.owner_id`).
- **`sendNotification` inserts via service client** — cross-user notifications (invitee→inviter) fail the organizer-only insert policy otherwise; callers authorize before calling. Skips null `user_id` (walk-in orders).
- **Postgres enum drift** — `event_notification_type` was missing `ORDER_CONFIRMED`/`ORDER_REJECTED`/`HERO_BOOST` → approve/reject RPCs rolled back at the notify step. Add enum values when adding notification types.
- **plpgsql OUT params shadow columns** — `RETURNS TABLE (order_id ...)` makes `where order_id = ...` ambiguous; qualify (`t.order_id`).
- **`create or replace` keeps old overloads** — always `drop function` the old signature first.
- **approve_order mints tickets** (`generate_series` + sha256 qr_hash) — a refactor once dropped this; regression caught by E2E `tickets=0` check.
- **E2E fixtures** — seed/e2e resolve DEVTEST events by `ilike 'DEVTEST%'` oldest-first (J1 renames the event); reset must delete `payment_ledger`+`refunds` before `orders` (FK).
- **Outbox:** `sendNotification` enqueues `notification_outbox` rows for push/email/whatsapp — the table is dormant (cron returns `skipped`) until a provider env exists; rows expire at 24h. When wiring Expo/FCM, implement the delivery call in `src/app/api/cron/drain-notifications/route.ts`, not in sendNotification.
- **KYC review-panel fixes:** REJECTED status used to fall into the "Verification in progress" label (missing case in statusLabel). The KYC realtime refresher was mounted AFTER the early return for pending/rejected states — those users never got live updates. The review panel posted kycResponseNote + doc URLs to updateOrganizerAction which silently dropped them (fields weren't read). Withdraw now deletes the organizers row (service client — privileged) only when status != APPROVED and zero events exist.
- **Admin notifications:** `notifyAdmins({type, message})` in shared/notifications.ts fans out to every profiles.is_admin user (in-app). Fires on KYC submit/resubmit, boost request, hero-boost UTR, door-staff UTR. Types: KYC_SUBMITTED/BOOST_REQUESTED/DOOR_STAFF_REQUESTED (STEP 30 enum).
- **isOrganizer flag trap:** profiles.is_organizer stays TRUE through PENDING/REJECTED — never use it for "show organizer UI". Always derive from getOrganizerAccessState({kycStatus, rejectionCount, rejectionLimit}).eligible (APPROVED only). navbar.tsx had the flag short-circuit bug; layout/footer were already correct.
