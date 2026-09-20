# Memory — decisions, bugs & fixes log

One-sentence purpose: append-only knowledge so agents never re-derive a past fix — check here before debugging.
Format: `Date · Area · What happened/decision → Fix/rule · Files`. Newest entries go on top.
Last updated: 2025-09-20

## 2025-09-20

- **Repo · Placeholder monorepo removed** — untracked `apps/` + `packages/` stub folders (created by an earlier session, never wired to build) were confusing agents → deleted; target structure now lives in `docs/architecture.md` §3 and code moves happen in Phase R (see `docs/task.md`).

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
