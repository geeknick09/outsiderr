# modules/campaigns

**Status:** Foundation stub (Phase R7) — contract types only, no live UI/tables yet.

## Purpose

Ad-click aggregation + attribution. Track outbound campaign/ad clicks and
attribute downstream bookings so Outsiderr can report which channels (organizer
links, influencer shares, paid ads) actually drive ticket sales.

## Owns

- `campaigns`, `campaign_links`, `click_events`, `attributions` tables (planned)
- Redirect route `GET /c/[slug]` → log click → 302 to `target_url`
- Aggregated click/attribution reporting (consumed by `analytics`)

## Uses

- `shared` — db, auth, types
- `analytics` — reporting surface for click→booking attribution

## Data model

See `types.ts` for the contract and `docs/prd.md` § Campaigns for the full spec
(tables, redirect flow, attribution window, privacy rules — UA/IP hashed only).

## When extracting to apps/campaigns

Everything here is self-contained behind `index.ts`. The `/c/[slug]` redirect and
click-logging route move with this module; analytics reads `click_events`/
`attributions` via the shared db (or a read API if the DB is split).
