# outsiderr

Outsider is an underground event discovery and ticketing platform modeled after modern event discovery UIs (like District.in). It features a dark-mode, media-rich design with sticky category filters, automated location detection, and seamless guest browsing.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Auth, Postgres, Storage) · `next-themes` · `html5-qrcode`

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — see demo mode below
npm run dev
```

### Demo mode

With `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset, the app runs
against an in-memory catalog with cookie-based sign in, so discovery, checkout,
verification and door scanning are all clickable without a Supabase project. Demo state
resets when the server restarts.

### Supabase mode

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Create a public Storage bucket named `event-media`.
3. Enable Phone (SMS OTP) and Google providers in Auth.
4. Set the two env vars above and restart the dev server.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Discovery: category pills, featured carousel, today / popular / all feeds |
| `/events/[id]` | Event details, ticket tiers (max 5 per order), T&C |
| `/login` | Phone OTP + Google OAuth (demo sign in when Supabase is unset) |
| `/checkout` | UPI QR, UTR + screenshot submission → `PENDING_VERIFICATION` |
| `/tickets` | Orders and confirmed QR passes |
| `/organizer` | Event creation and payment verification queue |
| `/organizer/scan` | Camera door scanner (`VALID` / `ALREADY USED` / `INVALID`) |

## Fees

Platform commission is 5%. `fee_payer = BUYER` adds it on top of the ticket price;
`fee_payer = ORGANIZER` keeps the buyer price as listed and deducts it from the payout.
