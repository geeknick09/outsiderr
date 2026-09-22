# Rules — for AI agents (and humans) working in this repo

One-sentence purpose: the non-negotiable how-to-work-here rules. Read order below is mandatory.
Last updated: 2025-09-20

## 1. Read order (mandatory, every session)

1. `docs/rules.md` — this file.
2. `docs/task.md` — find the task; check status/blockers/remarks.
3. `docs/memory.md` — check if your bug/decision was already hit and fixed.
4. `docs/architecture.md` — find the owning module before touching code.
5. `PRODUCT_VISION.md` — only when making product calls.

## 2. Product rules (from PRODUCT_VISION.md)

1. Culture before commerce. 2. Community before transactions. 3. Identity matters.
4. Everything connects (people↔crews↔places↔experiences↔content). 5. Physical world over digital vanity.
6. Authenticity over scale — never add mainstream categories for market size. 7. Not a BookMyShow/District clone.

## 3. Module rules (hard boundaries)

- Put code in the owning module: `src/modules/{shared,web,organizer,admin,scanner,analytics,campaigns}/`.
- Import ONLY via a module's public entries: `@/modules/<m>` (client-safe), `@/modules/<m>/server` (server-only), `@/modules/<m>/actions/<file>` (server actions by direct path).
- NEVER deep-import another module's internals (`@/modules/x/components/*`, `@/modules/x/data/*`).
- `@/lib`, `@/components`, `@/actions` do not exist anymore — banned paths (ESLint enforced).
- `shared` holds NO domain business rules — only primitives + entities used by ≥3 modules.
- `src/app/**` routes stay thin: auth guard → fetch via module server API → render module component. No business logic in `page.tsx`.
- New domain → new `modules/<name>/` with `README.md` + `index.ts` (+ `server.ts` if it has data). Don't squat another module's folder.

## 4. Code rules

- Server Components fetch; Client Components interact; Server Actions mutate (+ `revalidatePath` / `revalidateTag("events")`).
- Every server action: `requireAdmin()` / ownership check server-side first; validate input with Zod schema in `shared/lib/validation`.
- Data-access files get `import "server-only"` and live in `<module>/server.ts` exports only.
- Money: integer paise everywhere; DB is source of truth; fee snapshots on orders; no hard deletes on financial tables.
- Errors: use `logger` (pino, auto-redacts) — never `console.*` in critical paths, never log secrets.
- Keep it compact; match surrounding style; no drive-by refactors.

## 4a. API & orchestration rules (mobile-ready)

- **`/api/v1/*` is the client API** (future React Native apps). Bearer JWT (`Authorization: Bearer <supabase-access-token>`) for user/organizer routes; PIN-in-body for scanner/box-office. Response envelope: `{ ok: true, data }` | `{ ok: false, error }`.
- **Never write business logic in a route handler or server component.** Routes validate (zod) + call a data fn / service / action + map to `{ok}` — that's it.
- **Orchestration lives in `shared/services/*`** (e.g. `runCheckout`, `runVerifyPayment`) — plain fns taking `(user, input)`, called by BOTH the server action (FormData) and the API route (JSON). Money/payment logic must never be duplicated between the two surfaces.
- **Bearer auth plumbing:** routes wrap in `withApiUser(request, handler)` (401 + AsyncLocalStorage context). `createClient()` resolves the bearer token from context automatically — all data fns/RPCs/`getCurrentUser()` just work. Don't create clients manually in routes.
- **Secrets stay server-side:** Razorpay keys, service-role client only in actions/services/routes — never returned in a response or logged.
- **Thin RPC calls need no route** — mobile calls `supabase.rpc`/`supabase.from` directly for RLS-guarded reads and atomic ops (waitlist join, etc.). Routes exist for secret-bearing or multi-step work.
- **Notifications go through `sendNotification()`/`sendNotifications()`** (`shared/notifications.ts`) — never insert into `event_notifications` directly. Channels: `in-app` (implemented) + `push`/`email`/`whatsapp` (adapter stubs). Never throws.
- **Every new user-facing mutation gets a `/api/v1` route** when a mobile app will need it — same zod validation rules as the action.
- **Update `openapi.json`** when adding/changing a route.

## 5. Use / Don't use

| ✅ Use | ❌ Don't use |
|---|---|
| Tailwind utilities + `glass`, `text-muted`, `violet-neon`, `neon-gradient`, `shadow-glow-violet` | ad-hoc hex colors; inline `style` for colors |
| `lucide-react` icons | new icon deps |
| `zod` schemas in `shared/lib/validation` | hand-rolled validators in actions |
| `pino` via `shared` logger | `console.log` in actions/webhooks |
| `pg` in `scripts/*.mjs` (Node 21 has no native WS) | `supabase-js` realtime in node scripts |
| `next/dynamic({ ssr: false })` for browser-only libs (Leaflet, html5-qrcode) | `React.lazy` for them (→ `window is not defined`) |
| `next/image` for images | `<img>` (or add eslint-disable with reason) |
| separate queries + `Map` for related rows | nested Supabase FK selects on manually-typed tables (types don't expose FKs) |
| `organizers.avatar_url` | `photo_url` (doesn't exist) |

## 6. DB changes — the 4-step checklist

1. `supabase/schema.sql` (canonical).
2. Idempotent `alter table ... if not exists` (or equivalent) in `supabase/migrations/fix_all.sql`.
3. `src/modules/shared/db/database.types.ts` matching types.
4. Note it in `docs/task.md` → Known Issues. Apply to live DB via `node scripts/_apply_fix_all.mjs`.
Gotcha: changing an RPC's signature with `create or replace` leaves the OLD signature as an overload — `drop function if exists f(old_sig)` first.

## 7. Verification gate (before calling anything "done")

- `npx next build` → zero type errors (warnings OK, report them).
- `npx vitest run` → all suites green.
- Changed behavior smoke-checked (dev server) when routes moved or UI changed.
- Do NOT `git commit`/`push` unless the user explicitly says so (restructure phase R is the standing exception: commit per phase, never push).

## 8. Documentation duty (part of the task, not optional)

- Task status/blockers → `docs/task.md` (keep the tracker current).
- Non-obvious bug/decision/fix → append to `docs/memory.md` (newest first: `Date · Area · What · Why/Fix · Files`).
- Schema/structure/module change → `docs/architecture.md`.
- Feature completed/changed → `docs/prd.md` feature map.

## 9. Security

- Never commit secrets; env vars only via `.env` (see `.env.example`).
- RLS is the authorization source of truth; UI hiding ≠ security.
- Rate-limit public auth surfaces (PIN verify 20/min, box-office 10/min, check-in 60/min).
- Scanner/box-office PINs stored SHA-256(`event_id:pin`) hashed; plaintext only in organizer's generated-PIN display.
