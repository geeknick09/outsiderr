# Developer Docs — Outsiderr

New to the codebase? Read in this order:

1. **[01-architecture.md](./01-architecture.md)** — the whole system on one page: request flow, module map, module-boundary rule, the ticket-buy lifecycle.
2. **[02-database.md](./02-database.md)** — every table, its key columns, and what it's for. Start here when adding a feature — find the table first, the code follows the schema.
3. **[03-money-math.md](./03-money-math.md)** — where every rupee goes: order math, gateway gross-up, who pays what, promoter commissions, refunds, payouts, and the `platform_settings` knobs.

## The mental model in one paragraph

Next.js App Router renders pages as **server components** that read Postgres through RLS. All mutations go through **server actions**, which call **SECURITY DEFINER RPCs** for anything sensitive (orders, payments, refunds, payouts, invite tokens). Money is **always paise**, always computed in SQL. `payment_ledger` is the append-only journal; `payout_records`/`promoter_payouts` are the outflows; `event_notifications` drives the realtime bell.

## Quick pointers

- **Module rule:** never deep-import into `src/modules/*/components|data` — go through `index.ts`/`server.ts`/`actions/*` (lint fails the build otherwise).
- **Adding a setting?** `platform_settings` table + `getSettingInt(key)` in `src/modules/shared/data/platform-settings.ts` + a field in `settings-panel.tsx` (admin UI).
- **Adding a notification?** insert into `event_notifications` (realtime is already wired) — community-linked notifications get `community_id` for the Join button.
- **Testing:** `npx tsc --noEmit` → `npx next lint` → `npx vitest run` → `npm run build`. All four before pushing.
