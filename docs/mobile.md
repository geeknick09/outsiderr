# Mobile Readiness — Outsiderr (Android + iOS)

Target: **3 native apps** — `Outsiderr` (attendee), `Outsiderr Organizer`, `Outsiderr Scanner`.
Admin stays web-only (responsive `/admin` is enough for a back-office tool).

This doc is the prep plan so the mobile build is mostly UI work later — not a re-architecture.

> **Status: M1 ✅ M2 ✅ M3 ⏭️ skipped (email auth) M4 ✅ M5 ✅** — the `/api/v1` REST
> surface, channel-aware `sendNotification`, architecture rules, and portable
> `api-client` are all in place. The web app is unchanged (server actions still
> serve it); the API is additive.

---

## 1. Architecture reality check

The backend is already ~80% mobile-ready:

- **Supabase is the real API.** Auth, Postgres, Storage, Realtime all work from a mobile app via `supabase-js` + the anon key + RLS. No changes needed.
- **32 RPCs carry the business logic** — `create_reserved_order`, `confirm_razorpay_order`, `check_in_ticket`, `join_waitlist`, `verify_scanner_pin`, etc. Mobile calls them directly; atomicity/oversell/FIFO guarantees hold regardless of client.
- **TS types + Zod schemas** in `modules/shared/lib` port to React Native unchanged.
- **`/api/v1` REST surface exists** (32 routes) — every secret-bearing or orchestrated flow is now callable over HTTP.

Server actions (`"use server"`) remain Next.js-only — mobile calls `/api/v1` routes or `supabase.rpc` directly:

| Strategy | When |
|---|---|
| **Call the RPC directly** via `supabase.rpc()` | Anon-key-safe, single-step mutations (join waitlist, check-in, free orders, club join). RLS already enforces auth. |
| **Call `/api/v1/*`** | Anything using **secrets** (Razorpay key/secret, service-role) or **multi-step orchestration** (order → payment → verify → ticket + notification). Server keeps the secrets; the app just gets a result. |

---

## 2. M1–M5 — implemented

### M1 ✅ — `/api/v1` REST surface

32 routes under `src/app/api/v1/` covering the 3 apps' mutation surface:

- **Auth:** `Authorization: Bearer <supabase-access-token>` for user/organizer routes; **PIN-in-body** for scanner/box-office.
- **Envelope:** `{ ok: true, data }` | `{ ok: false, error }` — 400 validation/business, 401 unauthenticated/invalid PIN, 429 rate-limited.
- **How it works:** `withApiUser(request, handler)` puts the JWT in an `AsyncLocalStorage` context (`shared/auth/api-context.ts`); `createClient()` returns a bearer-scoped client, so `auth.uid()`/RLS/data fns behave identically to the cookie session. **Zero duplication** — routes call the same data fns and services as the web actions.
- **Payments orchestration** lives in `shared/services/orders.ts` (`runCheckout`, `runVerifyPayment`, `runPaymentFailure`, `runManualCheckout`, `runPostponementRefund`) — called by both the server actions and the routes, so money logic can never diverge.
- **Full contract:** `GET /api/openapi.json` (Swagger UI at `/api-docs`).

Routes: `me`, `checkout`, `payments/verify`, `payments/failure`, `orders/manual`, `refunds/postponement`, `events` (+`[id]`/`publish`/`cancel`/`postpone`/`subscribe`), `organizers/[id]/follow`, `orders/[id]/approve`/`reject`, `reviews`, `profile`, `notifications/read`, `clubs` (+`[id]/join`), `collab/invite`/`respond`, `pins` (+`[id]`), `event-staff`, `boosts`, `organizer`, `scanner/login`/`check-in`/`walkin`, `box-office/login`/`orders`.

### M2 ✅ — `sendNotification()` channel abstraction

`shared/notifications.ts`: `sendNotification({userId, type, message, eventId?, channels?})` + `sendNotifications` batch. `in-app` writes `event_notifications`; `push` resolves `push_subscriptions` (provider send is a TODO — needs Expo Push/FCM/web-push); `email`/`whatsapp` are adapter stubs. All call sites migrated (KYC ×3, collab ×2, waitlist offer, event-update fan-out). **Never throws** — notification failure can't break a transaction.

### M3 ⏭️ — skipped (email-only auth for now)

Revisit when adding phone OTP: Supabase native OTP + `outsiderr://` deep-link scheme. The bearer-token plumbing already supports any Supabase auth method, so nothing to redo.

### M4 ✅ — orchestration conventions

`docs/rules.md` §4a: no business logic in routes/server components; orchestration in `shared/services/*`; thin RLS-guarded RPCs stay direct-call; secrets server-side only; every mobile-needed mutation gets a `/api/v1` route + OpenAPI entry.

### M5 ✅ — portable API client

`shared/api/client.ts` — `createOutsiderrClient({baseUrl, getAccessToken})`, pure TS (zero next/* imports), one typed method per route + PIN-auth variants. This is the seed of `packages/api-client`; the RN apps import it verbatim.

---

## 3. Per-app scope

| App | Screens | Mobile-specific | Est. (Expo RN) |
|---|---|---|---|
| **Scanner** | PIN login → event select → camera scan → result; offline queue | `expo-camera` QR scan, AsyncStorage queue, haptics | ~3–4 wk |
| **Organizer** | dashboard, event list/CRUD, orders+verify, KYC, collab, PINs, analytics | push for order/KYC events, image pickers | ~6–10 wk |
| **Outsiderr** | discovery feed, event detail, checkout (Razorpay native SDK), ticket wallet + QR, clubs, reviews, notifications, profile | native Razorpay sheet, push, deep links, share | ~8–12 wk |

Plus ~2–3 wk shared plumbing (auth flow, push, store setup, OTA via EAS Update) — **the API client + auth plumbing already exist**.

**Sequencing:** Scanner → Outsiderr → Organizer.

## 4. React Native — decision

- **React Native/Expo** (chosen) = real native UI, reuses all backend + types + RPCs + the `/api/v1` surface + `api/client.ts`.
- Capacitor (WebView wrap) was evaluated and rejected — weaker UX, Apple 4.2 risk.
- **Scanner can even start as the existing PWA** (offline queue already works; camera API is decent) — the `/api/v1/scanner/*` routes make a native upgrade trivial later.

## 5. Future monorepo shape

```
apps/web            — this Next.js app (admin + web PWA)
apps/mobile         — Outsiderr attendee app (Expo)
apps/organizer-app  — organizer/sponsor app (Expo)
apps/scanner-app    — door scanner app (Expo)
packages/api-client — seed: src/modules/shared/api/client.ts
packages/types      — seed: src/modules/shared/lib/types.ts + db/database.types.ts
packages/validation — seed: src/modules/shared/lib/validation.ts
packages/utils      — seed: format/datetime/pricing/phases
```

## 6. Open questions

- One Expo app with role-based navigation vs 3 separate apps? (3 apps = cleaner stores listing + smaller bundles; shared `packages/*` keeps them DRY — current lean: **3 apps**.)
- Offline mode for organizer app? (scanner needs it; organizer probably read-only offline.)
- Native Razorpay vs hosted checkout page in a webview inside the app (acceptable shortcut for v1).
