# Outsiderr

> City-first platform for discovering underground culture, extreme sports, hip-hop, and fitness experiences.

From skateboarding, BMX, parkour and climbing to hip-hop sessions, battles, cyphers, dance, strength training and other alternative fitness communities — Outsiderr brings together the people, events and experiences that exist outside the mainstream.

Unlike traditional event platforms, Outsiderr is curated. Events are not freely published by external organizers. The Outsiderr team controls what gets listed, ensuring that every event fits the platform's culture, community and quality standards.

## Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Supabase** — Auth (Phone OTP + Google OAuth), PostgreSQL with Row Level Security, Storage, Realtime, RPC functions
- **Tailwind CSS** + project classes: `glass`, `text-muted`, `violet-neon`, `neon-gradient`, `shadow-glow-violet`
- **Razorpay** — retained for Hero Boosts and future payment flows (not used for ticket booking in current release)
- **html5-qrcode** — QR code scanning for door check-in

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Razorpay credentials
npm run dev
```

The app requires Supabase credentials to function (demo mode has been removed).

### Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor (creates all tables, RLS policies, and RPCs).
3. Run `supabase/migrations/fix_all.sql` to apply incremental schema fixes.
4. Create a public Storage bucket named `event-media`.
5. Enable **Phone (SMS OTP)** and **Google** providers in Auth settings.
6. Set environment variables (see [`.env.example`](.env.example)) and restart.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server only — never expose to browser) |
| `CRON_SECRET` | Yes | Secret for the reservation expiry cron endpoint |
| `RAZORPAY_KEY_ID` | No* | Razorpay API key (for Hero Boosts) |
| `RAZORPAY_KEY_SECRET` | No* | Razorpay API secret |
| `RAZORPAY_WEBHOOK_SECRET` | No* | Razorpay webhook HMAC secret |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | No* | Razorpay public key (for Checkout.js) |

\* Razorpay variables are optional for the current release (manual UPI ticket flow). Required only for Razorpay-managed flows like Hero Boosts.

## Routes

### Public

| Route | Purpose |
|-------|---------|
| `/` | Discovery: category pills, featured carousel, today / popular / all feeds |
| `/events/[id]` | Event details, ticket tiers (max 5 per order), T&C |
| `/organizers/[id]` | Organizer public profile and their events |
| `/clubs` | Browse culture clubs (skate crews, hip-hop collectives, etc.) |
| `/clubs/[id]` | Club profile and member list |
| `/about` | About page |
| `/contact` | Contact page |
| `/legal/[slug]` | Legal pages (Terms, Privacy, Refund Policy) |
| `/list-your-event` | Landing page for prospective organizers |

### Authentication

| Route | Purpose |
|-------|---------|
| `/login` | Phone OTP + Google OAuth sign-in |

### User

| Route | Purpose |
|-------|---------|
| `/checkout` | Ticket checkout — free RSVP or manual UPI payment with organizer verification |
| `/tickets` | My tickets — orders, QR passes, check-in status, refund requests |
| `/tickets/[id]/print` | Printable ticket with QR code |
| `/profile` | User profile — name, phone, gender, city, interests, avatar |
| `/scan` | QR scanner for door staff (restricted access) |

### Organizer

| Route | Purpose |
|-------|---------|
| `/organizer` | Dashboard — event list, analytics overview, aggregated stats |
| `/organizer/events/[id]` | Event management — analytics, verification queue, attendees, edit, staff, Hero Boost, cancel/postpone |
| `/organizer/events/[id]/orders` | All orders for an event |
| `/organizer/events/[id]/checkins` | Check-in history for an event |
| `/organizer/events/[id]/report` | Printable revenue report (gross, commission, convenience fee, payout, orders, tickets) |
| `/organizer/events/[id]/scan` | Event-specific QR scanner |
| `/organizer/scan` | Global QR scanner for organizers |
| `/organizer/boost` | Boost request page (featured placement) |

### Admin

| Route | Purpose |
|-------|---------|
| `/admin` | Overview — events, orders, GMV, revenue, payouts, users, DAU/MAU |
| `/admin/events` | All events — status, fee overrides, featured toggle, delete |
| `/admin/orders` | All transactions — filterable by status |
| `/admin/revenue` | Revenue report — charts, trends, PDF export |
| `/admin/analytics` | User analytics — DAU, MAU, returning users |
| `/admin/payments` | Payment reconciliation — webhook health, stale reservations |
| `/admin/payouts` | Organizer payout records — pending, completed, bank references |
| `/admin/users` | User management — admin toggle, roles |
| `/admin/boosts` | Boost request approvals |
| `/admin/hero-boosts` | Hero Boost (Front Row) approvals |
| `/admin/clubs` | Club approval queue |
| `/admin/door-staff` | Door staff pricing and availability |
| `/admin/settings` | Platform settings — cancellation/postponement charges, pricing |
| `/admin/legal` | Legal page management |

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/razorpay/webhook` | POST | Razorpay webhook receiver (payment capture, failure, refund events) |
| `/api/cron/expire-reservations` | GET | Cron job to expire stale reserved orders (every 1 min) |
| `/api/health` | GET | Health check (no auth required) |
| `/api/openapi.json` | GET | OpenAPI 3.0 spec (machine-readable) |
| `/api-docs` | GET | Interactive Swagger UI for testing API endpoints |

**Swagger UI:** Visit `http://localhost:3000/api-docs` in your browser to view and test all HTTP API endpoints interactively.

See [API_SPEC.md](API_SPEC.md) for full API documentation including all Server Actions, Supabase RPCs, realtime channels, and the financial model.

## Payment Flow (Current Release)

### Free Events
1. User clicks "Confirm RSVP" on the checkout page
2. Order is created as `CONFIRMED` with tickets minted instantly
3. Ticket appears in "My Tickets" with a QR code

### Paid Events (Manual UPI)
1. Checkout page shows organizer's UPI ID, QR code, and contact phone
2. User pays externally via GPay/PhonePe/UPI (scan QR or use UPI ID)
3. User optionally enters a UTR/Transaction ID (not mandatory)
4. User submits the booking — order is created as `PENDING_VERIFICATION`
5. Organizer sees the order in their Verification Queue and approves or rejects it
6. On approval, tickets are minted with QR hashes and order becomes `CONFIRMED`
7. User sees the ticket appear in "My Tickets" via realtime update

> **Note:** For faster verification, users are prompted to send their GPay/PhonePe
> screenshot to the organizer's phone number (shown on the checkout page).

## Financial Model

All money is stored in **paise** (integer) to avoid floating-point errors.

| Field | Formula | Description |
|-------|---------|-------------|
| Subtotal | `unit_price × quantity` | Ticket face value × quantity |
| Commission | `subtotal × commission_bps / 10000` | Platform commission (default 10%) |
| Convenience fee | `subtotal × convenience_fee_bps / 10000` | Buyer fee (default 2%) |
| Platform revenue | `commission + convenience_fee` | Total platform earnings |
| Organizer payout | `subtotal - commission` | What the organizer receives |
| Buyer pays | `subtotal + convenience_fee` | Total amount paid by buyer |

**Revenue analytics count only `CONFIRMED` orders.** Pending, rejected, cancelled, expired, failed, and refunded orders are excluded from all money calculations.

Admins can override commission and convenience fee percentages per event via the admin events page. All changes are audit-logged.

## Build & Verify

```bash
npx next build   # must pass with zero type errors
```

### Test Suite

```bash
# Database-level tests (no dev server required)
node scripts/money-accuracy-test.mjs          # 104 checks — financial calculations
node scripts/revenue-sync-test.mjs            # 18 checks — revenue/payout sync
node scripts/e2e-money-inventory-test.mjs     # 45 checks — money + inventory invariants
node scripts/razorpay-flow-test.mjs           # 39 checks — Razorpay flow invariants
node scripts/admin-fee-test.mjs               # 10 checks — admin fee override + audit

# Browser-based tests (requires dev server running)
node scripts/free-event-test.mjs              # 13 checks — free event critical flow
node scripts/lifecycle-test.mjs               # 13 checks — draft → publish lifecycle
node scripts/phased-event-test.mjs            # 19 checks — phased event flow
node scripts/tba-category-test.mjs            # 10 checks — TBA venue + category
```

## Key Documentation

| File | Description |
|------|-------------|
| [PRODUCT_VISION.md](PRODUCT_VISION.md) | Product constitution — read before making product decisions |
| [API_SPEC.md](API_SPEC.md) | Full API specification — routes, server actions, RPCs, realtime |
| [BACKLOG.md](BACKLOG.md) | Tracked work, known issues, and vision roadmap |
| [AGENTS.md](AGENTS.md) | Agent guidelines — tech stack, conventions, build process |
| [supabase/schema.sql](supabase/schema.sql) | Full database schema with RLS policies and RPCs |
| [supabase/migrations/fix_all.sql](supabase/migrations/fix_all.sql) | Incremental schema fixes — re-run after pulling |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # HTTP API routes (webhooks, cron)
│   ├── admin/              # Admin dashboard pages
│   ├── organizer/          # Organizer dashboard pages
│   ├── checkout/           # Ticket checkout
│   ├── tickets/            # User tickets and QR passes
│   ├── events/             # Public event detail pages
│   ├── clubs/              # Culture clubs
│   ├── profile/            # User profile
│   ├── scan/               # QR scanner (door staff)
│   └── login/              # Authentication
├── actions/                # Server Actions (mutations)
├── components/             # React components
│   ├── checkout/           # Checkout form, Razorpay checkout
│   ├── organizer/          # Analytics, verification queue, attendees, scanner
│   ├── admin/              # Admin UI components
│   ├── tickets/            # Ticket display, realtime wrapper
│   ├── scan/               # QR scanner components
│   └── ui/                 # Shared UI primitives (Button, Badge, Modal, etc.)
├── lib/
│   ├── data/               # Data access layer (orders, events, admin, etc.)
│   ├── supabase/           # Supabase client + database types
│   ├── auth.ts             # Current user identity
│   ├── pricing.ts          # Price calculation (source of truth)
│   ├── format.ts           # Formatting utilities (paise, dates)
│   ├── types.ts            # Shared TypeScript types
│   └── constants.ts        # Categories, cities, tags, labels
└── middleware.ts           # Route protection (auth, admin, organizer guards)

supabase/
├── schema.sql              # Canonical schema — tables, RLS, RPCs
└── migrations/
    └── fix_all.sql         # Incremental schema fixes
```

## License

Proprietary. © Outsiderr.
