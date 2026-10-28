# Outsiderr - High-Level Architecture

## What it is

A community-first events & culture platform. Users discover events and communities, organizers (creators) run events/communities/campaigns, admins govern the marketplace. All real money flows through Razorpay.

## Diagram

```mermaid
graph TD
    subgraph Clients
        WEB[Web App<br/>Next.js App Router]
        SCAN[Scanner/PWA<br/>/scan route]
    end

    subgraph App["Next.js 15 (Vercel)"]
        RSC[Server Components<br/>pages render via data fns]
        SA[Server Actions<br/>useActionState mutations]
        API[/api/v1/*<br/>REST for mobile]
        MW[Middleware<br/>auth + route guards]
    end

    subgraph Modules["src/modules"]
        SHARED[shared<br/>data / auth / actions / ui]
        WEBMOD[web<br/>public-facing components]
        ORG[organizer<br/>creator dashboard]
        ADMIN[admin<br/>governance]
        ANA[analytics<br/>views / virality / reports]
    end

    subgraph Supabase
        AUTH[Auth<br/>email + Google OAuth]
        PG[(Postgres)]
        RLS[Row-Level Security]
        RPC[SECURITY DEFINER RPCs<br/>order/checkout/refund/payout]
        RT[Realtime<br/>notifications channel]
        ST[(Storage<br/>event-media bucket)]
    end

    subgraph External
        RAZ[Razorpay<br/>checkout + refunds + webhook]
        VER[Vercel<br/>deploy + cron]
    end

    WEB --> MW --> RSC & SA
    SCAN --> API
    API -->|bearer token| PG
    RSC -->|select via RLS| PG
    SA -->|insert/update via RPC or service client| RPC
    SA --> AUTH
    PG --> RT --> WEB
    RSC --> ST
    SA -->|create order/checkout| RAZ
    RAZ -->|webhook| API
    VER -->|cron| SA
```

## Layers

| Layer | Where | What it does |
|-------|-------|--------------|
| **Middleware** | `src/middleware.ts` | Session refresh + route guards (`/admin`, `/organizer`, `/profile`, `/tickets`) |
| **App Router pages** | `src/app/**` | Server components - fetch data server-side, render HTML |
| **Server Actions** | `src/modules/*/actions/*.ts` | All mutations - called via `useActionState`/`useTransition` |
| **REST API** | `src/app/api/v1/**` | Mobile clients (bearer-token auth via `withApiContext`) |
| **Modules** | `src/modules/{shared,web,organizer,admin,analytics}` | Data fns (`data/`), UI (`components/`), types |
| **Supabase** | `supabase/` | Postgres + Auth + RLS + RPCs + Realtime + `event-media` bucket |
| **Razorpay** | checkout + webhook | Payment intent → confirm → refund paths |

## Module-boundary rule (important)

ESLint enforces `no-restricted-imports`: **never deep-import** into `src/modules/<x>/components|data/...` from outside that module. Always go through the module's `index.ts` / `server.ts` / `actions/*`. Violations fail the build.

## Data flow (one example - buying a ticket)

1. `GET /events/[id]` → server component calls `getEvent` (RLS select) → page renders
2. User clicks Buy → `createOrderAction` (server action)
3. Action calls the **`create_reserved_order` RPC** - all money math happens in SQL (`SECURITY DEFINER`), never client-side
4. Razorpay checkout opens → on success the webhook `/api/v1/payments/webhook` flips the order `RESERVED → CONFIRMED` and mints tickets
5. `event_notifications` insert → realtime channel `notifications:{userId}` → bell updates without reload

## Tracked-link flows (promoters)

- **`/p/<slug>`** - event-promotion link. `route.ts` logs a deduped
  `promoter_clicks` row, drops `oc_promo` cookie (30d), redirects to the event.
  At checkout the cookie attributes the order (`orders.promoter_id`/`promoter_via`);
  `trg_promoter_earning` mints an earning on CONFIRMED.
- **`/r/<slug>`** - creator-referral link (`link_kind='ORGANIZER'`). Same pattern:
  click logged, `outsiderr_ref` cookie (TTL = `promoter_org_attribution_days`),
  redirects to `/list-your-event`. On creator-signup `createOrganizerAction`
  calls `attribute_organizer_referral` → `organizers.referred_by_promoter_id`.
  `trg_mark_org_referral` stamps the organizer's first N **paid** publishes with
  `events.referral_promoter_id`; `trg_org_referral_earning` mints
  `via='ORG_REFERRAL'` earnings = share_bps of platform commission (Outsiderr's
  cost - never deducted from organizer payouts).
- Both link kinds share `promoter_links` (nullable `event_id` + `link_kind` +
  `expires_at`), `promoter_clicks`, `promoter_earnings`, `promoter_payouts`.

## Key invariants

- **All money is paise** (integer) - never floats, never client-computed
- **RLS everywhere** - user-facing reads go through RLS; anything sensitive goes through service-role + `SECURITY DEFINER` RPCs (keys/tokens/secrets never readable by anon/auth users)
- **Invite links are secrets** - `invite_token` columns are column-level revoked; validated only via RPCs
- **Uploads live in `event-media`** - user-scoped tree: `users/{uid}/` → `profile/avatar`, `organizer/avatar`, `organizer/kyc`, `organizer/events/{slug}`, `communities/uploads`
