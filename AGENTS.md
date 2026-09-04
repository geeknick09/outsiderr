# Outsiderr — Agent Guidelines

## Before You Start

**Read `PRODUCT_VISION.md` first.** It is the product constitution and north star for every decision.

## Core Principles (from the vision)

1. **Culture before commerce** — Does this help people participate in or discover the scene? Before asking "can we monetize this?"
2. **Community before transactions** — A person joining a crew and returning every week is more valuable than a one-time ticket purchase.
3. **Identity matters** — Artists, riders, crews, organizers, and participants should have meaningful profiles and history.
4. **Everything should connect** — People ↔ Crews ↔ Places ↔ Experiences ↔ Content. Avoid isolated entities.
5. **The physical world matters** — The app should drive real-world participation: go to a session, join a cypher, meet a crew, visit a spot.
6. **Authenticity over scale** — Do not add mainstream categories just because they increase market size. A smaller authentic community is more valuable than a large generic event catalog.
7. **Don't copy mainstream event apps** — If a proposed feature makes Outsiderr look more like a generic ticketing platform, question it.

## What Outsiderr Is NOT

- ❌ A generic ticket marketplace (ticketing is a feature, not the product identity)
- ❌ Another BookMyShow / District clone
- ❌ Instagram for underground culture (no generic social posting)
- ❌ A generic social network (follow/likes support participation, not the entire product)
- ❌ A generic event CMS (events connect to people, crews, places, culture, content)

## Tech Stack

- Next.js App Router + React + TypeScript
- Supabase (Auth, Database with RLS, Storage, RPCs)
- Server Components for page-level loading, Client Components for interactivity
- Server Actions for mutations, `revalidatePath` for targeted cache invalidation
- Tailwind-style utility classes + project classes: `glass`, `text-muted`, `violet-neon`, `neon-gradient`, `shadow-glow-violet`

## Key Files

- `PRODUCT_VISION.md` — Product constitution. Read first.
- `BACKLOG.md` — All tracked work, progress, and vision roadmap pointers.
- `supabase/schema.sql` — Full database schema with RLS policies.
- `supabase/migrations/fix_all.sql` — Incremental schema fixes. Re-run after pulling.
- `src/lib/types.ts` — Shared TypeScript types.
- `src/lib/auth.ts` — Current user identity and session.
- `src/lib/constants.ts` — Categories, cities, predefined tags, labels.

## Build & Verify

```bash
npx next build
```

Must pass with zero type errors before considering work complete.

## Database Changes

If you add columns/tables:
1. Update `supabase/schema.sql` (the canonical schema)
2. Add `alter table ... add column if not exists` to `supabase/migrations/fix_all.sql`
3. Update `src/lib/supabase/database.types.ts` with matching types
4. Update `BACKLOG.md` "Known Issues" section to mention the new migration

## Demo Mode

Demo mode has been removed. The app requires Supabase credentials in `.env` to function.
