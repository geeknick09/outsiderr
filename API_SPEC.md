# Outsiderr — API Specification

This document describes all HTTP API routes, Server Actions, Supabase RPCs, and
realtime channels used by the Outsiderr platform.

---

## Table of Contents

1. [HTTP API Routes](#1-http-api-routes)
2. [Server Actions](#2-server-actions)
3. [Supabase RPC Functions](#3-supabase-rpc-functions)
4. [Realtime Channels](#4-realtime-channels)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Environment Variables](#6-environment-variables)

> **Interactive Testing:** Visit `/api-docs` on your running server for a Swagger UI where you can view and test all HTTP endpoints. The OpenAPI spec is served at `/api/openapi.json`.

---

## 1. HTTP API Routes

### `POST /api/razorpay/webhook`

Razorpay webhook receiver. Handles payment lifecycle events for Razorpay-managed
flows (Hero Boosts, future Razorpay ticket bookings).

| Property | Value |
|----------|-------|
| Method | `POST` |
| Runtime | `nodejs` (needs `crypto` for HMAC) |
| Auth | Razorpay HMAC-SHA256 signature via `x-razorpay-signature` header |
| Idempotency | `webhook_events` table keyed on `razorpay_event_id` |

**Request body:** Raw JSON (read as text for signature verification before parsing).

**Handled event types:**

| Event | Action |
|-------|--------|
| `payment.captured` | Calls `confirmRazorpayOrder()`, inserts `payment_ledger` entry |
| `order.paid` | Same as `payment.captured` |
| `payment.failed` | Calls `failRazorpayOrder()`, sets order status to `FAILED` |
| `refund.processed` | Updates `refunds.status = 'COMPLETED'`, inserts refund `payment_ledger` entry |
| `refund.failed` | Updates `refunds.status = 'FAILED'` |

**Responses:**

| Status | Body | When |
|--------|------|------|
| 200 | `{ status: "ok" }` | Event processed successfully |
| 200 | `{ status: "already_processed" }` | Duplicate event (idempotency hit) |
| 401 | `{ error: "Invalid signature" }` | HMAC verification failed |
| 400 | `{ error: "Invalid JSON" }` | Body is not valid JSON |
| 400 | `{ error: "Missing event id" }` | Payload has no event id |
| 500 | `{ error: "Webhook not configured" }` | `RAZORPAY_WEBHOOK_SECRET` missing |

---

### `GET /api/cron/expire-reservations`

Cron endpoint that expires stale `RESERVED` orders whose 15-minute reservation
window has elapsed. Releases reserved inventory back to the tier pool.

| Property | Value |
|----------|-------|
| Method | `GET` |
| Runtime | `nodejs` |
| Auth | Bearer token via `Authorization: Bearer <CRON_SECRET>` header |
| Security | Timing-safe comparison to prevent timing attacks |
| Schedule | Every 1 minute (Vercel Cron or external scheduler) |

**Responses:**

| Status | Body | When |
|--------|------|------|
| 200 | `{ status: "ok", expired_orders: N, timestamp: "..." }` | Success |
| 401 | `{ error: "Unauthorized" }` | Missing or invalid secret |
| 500 | `{ error: "Cron not configured" }` | `CRON_SECRET` env var missing |
| 500 | `{ status: "error", error: "..." }` | Internal error |

---

### `GET /api/health`

Health check endpoint. No authentication required.

| Property | Value |
|----------|-------|
| Method | `GET` |
| Runtime | `nodejs` |
| Auth | None |

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2026-09-07T12:00:00.000Z",
  "uptime": 3600
}
```

---

### `GET /api/openapi.json`

Serves the OpenAPI 3.0.3 specification for all Outsiderr HTTP API routes. Used by the Swagger UI at `/api-docs`.

| Property | Value |
|----------|-------|
| Method | `GET` |
| Auth | None |
| Content-Type | `application/json` |

---

### `GET /api-docs`

Interactive Swagger UI page. Loads Swagger UI from CDN and renders the OpenAPI spec. Users can view all routes, schemas, and send test requests directly from the browser.

| Property | Value |
|----------|-------|
| Method | `GET` |
| Auth | None |
| Dependencies | None (CDN-loaded Swagger UI) |

---

## 2. Server Actions

All server actions are defined in `src/actions/` and use `"use server"` directive.
They are invoked from Client Components via form actions or direct calls.

### Orders (`src/actions/orders.ts`)

#### `submitPaymentAction(prevState, formData)`

Handles both free and paid ticket bookings.

| Parameter | Source | Required | Description |
|-----------|--------|----------|-------------|
| `eventId` | formData | Yes | Event UUID |
| `tierId` | formData | Yes | Ticket tier UUID |
| `quantity` | formData | Yes | Number of tickets (1–5) |
| `isFree` | formData | Yes | `"1"` for free events, `"0"` for paid |
| `buyerName` | formData | No | Defaults to user's profile name |
| `buyerPhone` | formData | No | Defaults to user's profile phone |
| `buyerEmail` | formData | No | Optional buyer email |
| `buyerGender` | formData | No | Optional (`male` / `female` / `other`) |
| `utrReference` | formData | No | UPI transaction reference (optional for paid events) |

**Free flow:** Calls `createFreeOrder()` → `create_free_order` RPC → order is `CONFIRMED` with tickets minted.

**Paid flow:** Calls `createOrder()` → `create_paid_order` RPC → order is `PENDING_VERIFICATION` awaiting organizer approval.

**Returns:** `{ error?: string }` on failure, or redirects to `/tickets?submitted=1` on success.

---

#### `approveOrderAction(formData)`

Organizer approves a pending manual UPI payment. Mints tickets.

| Parameter | Source | Required | Description |
|-----------|--------|----------|-------------|
| `orderId` | formData | Yes | Order UUID to approve |

**Calls:** `approveOrder()` → `approve_order` RPC → sets status to `CONFIRMED`, mints tickets with QR hashes, increments `quantity_sold` and `registrations_count`.

**Authorization:** Only event staff (organizer or admin) can approve.

---

#### `rejectOrderAction(formData)`

Organizer rejects a pending manual UPI payment.

| Parameter | Source | Required | Description |
|-----------|--------|----------|-------------|
| `orderId` | formData | Yes | Order UUID to reject |
| `reason` | formData | Yes | Rejection reason (visible to attendee) |

**Calls:** `rejectOrder()` → `reject_order` RPC → sets status to `REJECTED`, releases reserved inventory, triggers waitlist auto-offer if applicable.

---

#### `checkInTicketAction(qrHash, eventId)`

Door staff scans a QR code to check in an attendee.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `qrHash` | string | Yes | SHA-256 hash from the QR code |
| `eventId` | string | Yes | Event UUID for validation |

**Calls:** `check_in_ticket` RPC.

**Returns:** `{ status: "VALID" | "ALREADY_USED" | "INVALID", ticket?: Ticket }`

---

#### `requestPostponementRefundAction(formData)`

User requests a refund after an event is postponed.

| Parameter | Source | Required | Description |
|-----------|--------|----------|-------------|
| `orderId` | formData | Yes | Order UUID |
| `choice` | formData | Yes | `"refund"` or `"retain"` |

---

#### `createCheckoutAction(prevState, formData)`

Razorpay checkout flow (used for Hero Boosts, not for ticket booking in current release).

#### `verifyPaymentAction(input)`

Verifies Razorpay payment signature after checkout. Used for Razorpay-managed flows.

#### `handlePaymentFailureAction(input)`

Marks a Razorpay order as `FAILED` when payment fails.

---

### Events (`src/actions/events.ts`)

#### `createEventAction(prevState, formData)`

Organizer creates a new event (saved as `DRAFT`).

**Key fields:** `title`, `description`, `category`, `city`, `startsAt`, `endsAt`, `venueName`, `venueAddress`, `contactPhone`, `contactEmail`, `pricingMode` (`FREE` / `PAID`), tiers (name, pricePaise, quantity), tags, cover image.

#### `updateEventAction(prevState, formData)`

Organizer edits an existing event. Locked within 2 hours of start time.

#### `publishEventAction(eventId)`

Publishes a draft event — makes it visible on the discovery feed.

**Validation:** Event must have at least one tier with capacity > 0.

#### `cancelEventAction(formData)`

Cancels an event. Automatically refunds all confirmed orders via Razorpay (if applicable) and sets order statuses to `REFUNDED` or `REFUND_REQUESTED`.

| Parameter | Source | Required | Description |
|-----------|--------|----------|-------------|
| `eventId` | formData | Yes | Event UUID |
| `reason` | formData | Yes | Cancellation reason |

**Calls:** `cancel_event` RPC.

#### `postponeEventAction(formData)`

Postpones an event to a new date. Confirmed ticket holders can request a refund or retain their ticket.

| Parameter | Source | Required | Description |
|-----------|--------|----------|-------------|
| `eventId` | formData | Yes | Event UUID |
| `newStartsAt` | formData | Yes | New start date/time |
| `newEndsAt` | formData | No | New end date/time |
| `reason` | formData | Yes | Postponement reason |

**Calls:** `postpone_event` RPC.

---

### Admin (`src/actions/admin.ts`)

#### `adminDeleteEventAction(eventId)`
Deletes an event (admin only).

#### `adminUpdateEventStatusAction(eventId, status)`
Changes event status (`DRAFT` / `PUBLISHED` / `CANCELLED`).

#### `adminApproveOrderAction(orderId)`
Admin approves a pending order (same as organizer approve).

#### `adminRejectOrderAction(orderId, reason)`
Admin rejects a pending order.

#### `adminApproveBoostAction(boostId)` / `adminRejectBoostAction(boostId)`
Approve/reject a regular boost request.

#### `adminToggleAdminAction(userId, isAdmin)`
Grant or revoke admin privileges.

#### `adminToggleFeaturedAction(eventId, featured)`
Toggle event featured status on the discovery feed.

#### `adminUpdateEventAction(formData)`
Admin edits any event (overrides organizer ownership).

#### `adminUpdateSlotPriceAction(slot, pricePaise)`
Update the price of a featured carousel slot.

#### `adminUpdateEventFeesAction(eventId, params, reason)`
Override commission and convenience fee percentages for a specific event. All changes are audit-logged in `fee_audit_log`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | string | Event UUID |
| `commissionBps` | number | Commission in basis points (1000 = 10%) |
| `commissionEnabled` | boolean | Whether commission is active |
| `convenienceFeeBps` | number | Convenience fee in basis points (200 = 2%) |
| `convenienceFeeEnabled` | boolean | Whether convenience fee is active |
| `reason` | string | Audit reason for the change |

#### `adminApproveClubAction(clubId)` / `adminRejectClubAction(clubId)`
Approve/reject a club creation request.

#### `adminInitiateRefundAction(orderId, reason)`
Admin initiates a Razorpay refund for a confirmed order. Creates a `refunds` record and calls Razorpay refund API.

#### `adminRecordPayoutAction(formData)`
Records a manual bank transfer payout to an organizer in `payout_records`.

#### `updatePlatformSettingAction(formData)`
Update global platform settings (cancellation charge %, postponement charge %, door staff pricing, Hero Boost pricing, etc.).

---

### Event Staff (`src/actions/event-staff.ts`)

#### `addEventStaffAction(formData)`
Assigns a user as door staff for an event by email or phone.

#### `removeEventStaffAction(formData)`
Removes door staff assignment.

---

### Hero Boosts (`src/actions/hero-boosts.ts`)

#### `purchaseHeroBoostAction(eventId)`
Creates a Hero Boost request (Front Row placement) for an event.

#### `submitHeroBoostUtrAction(formData)`
Submits UTR for manual Hero Boost payment verification.

#### `activateHeroBoostAction(boostId)`
Admin activates an approved Hero Boost.

#### `cancelHeroBoostAction(boostId)`
Cancels a pending Hero Boost.

#### `createHeroBoostCheckoutAction(prevState, formData)`
Razorpay checkout flow for Hero Boost payment.

#### `verifyHeroBoostPaymentAction(input)`
Verifies Razorpay payment for Hero Boost.

---

### Profile (`src/actions/profile.ts`)

#### `updateProfileAction(formData)`
Updates user profile (name, phone, gender, avatar, city, bio, interested tags).

---

### Organizer (`src/actions/organizer.ts`)

#### `createOrganizerAction(prevState, formData)`
Creates an organizer profile (required before creating events). Includes UPI ID and QR URL for manual payment collection.

#### `updateOrganizerAction(prevState, formData)`
Updates organizer profile (UPI ID, QR URL, bio, social links).

---

### Clubs (`src/actions/clubs.ts`)

#### `createClubAction(prevState, formData)`
Creates a club (requires admin approval).

#### `joinClubAction(clubId)`
User requests to join a club.

#### `acceptMemberAction(memberId, clubId)` / `rejectMemberAction(memberId, clubId)`
Club admin accepts or rejects a join request.

---

### Notifications (`src/actions/notifications.ts`)

#### `markNotificationReadAction(notificationId)`
Marks a single notification as read.

#### `markAllNotificationsReadAction()`
Marks all of the current user's notifications as read.

---

### Push (`src/actions/push.ts`)

#### `subscribePushAction(subscription)`
Saves a Web Push subscription for the current user.

#### `unsubscribePushAction(endpoint)`
Removes a Web Push subscription.

---

### Waitlist (`src/actions/waitlist.ts`)

#### `joinWaitlistAction(eventId, tierId)`
User joins the waitlist for a sold-out tier.

#### `leaveWaitlistAction(entryId, eventId)`
User leaves a waitlist.

---

### Door Staff (`src/actions/door-staff.ts`)

#### `createDoorStaffOrderAction(formData)`
Creates a door staff payment order (organizer pays for on-site staff).

#### `verifyDoorStaffPaymentAction(input)`
Verifies Razorpay payment for door staff service.

---

### Boosts (`src/actions/boosts.ts`)

#### `requestBoostAction(input)`
Organizer requests a regular boost (featured placement) for their event.

---

### Auth (`src/actions/auth.ts`)

#### `signOutAction()`
Signs out the current user.

#### `saveThemePreferenceAction(theme)`
Saves the user's theme preference (`light` / `dark` / `system`).

---

### Legal Pages (`src/actions/legal-pages.ts`)

#### `saveLegalPageAction(formData)`
Admin creates or updates a legal page (Terms, Privacy, etc.).

#### `deleteLegalPageAction(slug)`
Admin deletes a legal page.

---

## 3. Supabase RPC Functions

All RPCs are defined in `supabase/schema.sql` and use `security definer` to bypass
RLS where needed. They are the source of truth for all money and inventory mutations.

### Order & Ticket RPCs

| RPC | Parameters | Returns | Description |
|-----|------------|---------|-------------|
| `create_free_order` | `p_user_id uuid, p_event_id uuid, p_tier_id uuid, p_quantity int, p_buyer_name text, p_buyer_phone text, p_buyer_email text, p_buyer_gender text` | `setof orders` | Creates a `CONFIRMED` order with tickets for free events. Auto-mints QR hashes. |
| `create_paid_order` | `p_user_id uuid, p_event_id uuid, p_tier_id uuid, p_quantity int, p_unit_price_paise bigint, p_buyer_name text, p_buyer_phone text, p_buyer_email text, p_buyer_gender text, p_utr_reference text, p_payment_proof_url text` | `orders` | Creates a `PENDING_VERIFICATION` order for paid events. Reserves inventory. UTR and proof are nullable. |
| `approve_order` | `p_order_id uuid` | `setof tickets` | Approves a pending order. Sets status to `CONFIRMED`, mints tickets with QR hashes, increments `quantity_sold` and `registrations_count`. |
| `reject_order` | `p_order_id uuid, p_reason text` | `orders` | Rejects a pending order. Sets status to `REJECTED`, releases reserved inventory, triggers waitlist auto-offer. |
| `check_in_ticket` | `p_qr_hash text, p_event_id uuid` | `tickets` | Validates and checks in a ticket by QR hash. Returns `USED` ticket or raises exception if invalid/already used. |
| `offer_waitlist_next` | `p_tier_id uuid` | `waitlist` | Offers the next waitlisted user a ticket when inventory becomes available. |

### Razorpay RPCs

| RPC | Parameters | Returns | Description |
|-----|------------|---------|-------------|
| `create_reserved_order` | `p_user_id uuid, p_event_id uuid, p_tier_id uuid, p_quantity int, p_unit_price_paise bigint, ...` | `orders` | Creates a `RESERVED` order with a 15-minute expiry for Razorpay checkout. |
| `confirm_razorpay_order` | `p_order_id uuid, p_razorpay_payment_id text, p_razorpay_signature text, p_payment_method text` | `orders` | Confirms a Razorpay payment. Sets status to `CONFIRMED`, mints tickets, records payment details. |
| `fail_razorpay_order` | `p_order_id uuid` | `orders` | Marks a Razorpay order as `FAILED` and releases reserved inventory. |
| `expire_reserved_orders` | — | `int` | Expires all stale `RESERVED` orders past their 15-minute window. Called by cron. |
| `set_razorpay_order_id` | `p_order_id uuid, p_razorpay_order_id text` | `orders` | Stores the Razorpay order ID on an internal order before checkout. |

### Event Lifecycle RPCs

| RPC | Parameters | Returns | Description |
|-----|------------|---------|-------------|
| `cancel_event` | `p_event_id uuid, p_reason text` | `void` | Cancels an event. Auto-refunds all confirmed orders. Updates `payment_ledger` with organizer liability. |
| `postpone_event` | `p_event_id uuid, p_new_starts_at timestamptz, p_new_ends_at timestamptz, p_reason text` | `void` | Postpones an event. Sets status to `POSTPONED`. Does not auto-refund — users choose refund or retain. |
| `request_postponement_refund` | `p_order_id uuid, p_choice text` | `orders` | Processes a user's refund/retain choice after postponement. If refund, initiates Razorpay refund and sets status to `REFUND_REQUESTED`. |

### Authorization RPCs

| RPC | Parameters | Returns | Description |
|-----|------------|---------|-------------|
| `is_current_user_admin` | — | `boolean` | Checks if the authenticated user is an admin. |
| `is_event_staff` | `p_event_id uuid` | `boolean` | Checks if the current user is the organizer or assigned staff for an event. |
| `is_door_staff_any` | — | `boolean` | Checks if the current user is assigned as door staff for any event. |
| `get_staff_organizer_ids` | — | `setof uuid` | Returns organizer IDs that the current user is staff for. |

### Utility RPCs

| RPC | Parameters | Returns | Description |
|-----|------------|---------|-------------|
| `handle_new_user` | trigger | `trigger` | Auto-creates a `profiles` row when a new auth user is created. |
| `increment_club_member_count` | `p_club_id uuid` | `void` | Increments club member count (called via trigger). |

---

## 4. Realtime Channels

Supabase Realtime is used for live updates across the platform. All channels
use `postgres_changes` on the `public` schema.

| Channel Name | Table | Event | Filter | Purpose |
|---------------|-------|-------|--------|---------|
| `organizer-orders-insert` | `orders` | `INSERT` | `event_id=in.(...)` | Notify organizer of new pending order |
| `organizer-orders-update` | `orders` | `UPDATE` | `event_id=in.(...)` | Update verification queue on approve/reject |
| `organizer-order-monitor` | `orders` | `*` | `event_id=in.(...)` | Order monitor live updates |
| `user-orders:${userId}` | `orders` | `UPDATE` | `user_id=eq.${userId}` | User sees order status changes (pending → confirmed) |
| `user-tickets-insert:${userId}` | `tickets` | `INSERT` | `user_id=eq.${userId}` | User sees new ticket appear after approval |
| `user-tickets-update:${userId}` | `tickets` | `UPDATE` | `user_id=eq.${userId}` | User sees ticket check-in status change |
| `event-detail:${eventId}` | `events` | `UPDATE` | `id=eq.${eventId}` | Realtime event detail updates (date/time/venue changes) |
| `event-orders:${eventId}` | `orders` | `*` | `event_id=eq.${eventId}` | Live order count on event detail page |

---

## 5. Authentication & Authorization

### Auth Provider

Supabase Auth with:
- **Phone OTP** (primary — Indian phone numbers, +91 prefix)
- **Google OAuth** (secondary)

### Role-Based Access

| Role | Access |
|------|--------|
| **Anonymous** | Discovery feed, event details, legal pages |
| **Authenticated user** | Checkout, tickets, profile, clubs, waitlist, notifications |
| **Organizer** | Everything a user can do + event creation, event management, verification queue, QR scanner, analytics, reports |
| **Door staff** | QR scanner only (`/scan` and `/organizer/events/[id]/scan`) |
| **Admin** | Everything + admin dashboard, all events, all orders, refunds, payouts, fee overrides, user management, platform settings |

### Row Level Security (RLS)

All tables have RLS enabled. Key policies:
- Users can only read/write their own `orders`, `tickets`, `notifications`, `push_subscriptions`.
- Organizers can only manage their own `events` and related data.
- Door staff can only access `tickets` for events they're assigned to.
- Admins have full access via `is_admin = true` check on `profiles`.
- RPCs use `security definer` to bypass RLS for authorized mutations (e.g., `approve_order` checks `is_event_staff` internally).

---

## 6. Environment Variables

| Variable | Scope | Required | Description |
|----------|-------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Yes | Supabase service role key (bypasses RLS — never expose to browser) |
| `SUPABASE_DB_PASSWORD` | Server only | No | Database password (used by test scripts) |
| `RAZORPAY_KEY_ID` | Server only | No* | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | Server only | No* | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Server only | No* | Razorpay webhook HMAC secret |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Client | No* | Razorpay key ID (safe for client bundle, used by Checkout.js) |
| `CRON_SECRET` | Server only | Yes | Secret for `/api/cron/expire-reservations` endpoint |

\* Razorpay variables are required only if using Razorpay-managed flows (Hero Boosts, future ticket bookings). Not required for the current manual UPI ticket flow.

---

## Financial Model

All money is stored in **paise** (1 rupee = 100 paise) as integers to avoid floating-point errors.

| Field | Formula | Description |
|-------|---------|-------------|
| `subtotal_paise` | `unit_price_paise × quantity` | Ticket face value × quantity |
| `commission_paise` | `subtotal × commission_bps / 10000` | Platform commission deducted from organizer |
| `convenience_fee_paise` | `subtotal × convenience_fee_bps / 10000` | Buyer convenience fee added on top |
| `platform_fee_paise` | `commission_paise + convenience_fee_paise` | Total platform revenue |
| `total_paise` | `subtotal_paise + convenience_fee_paise` | What the buyer pays |
| `organizer_payout_paise` | `subtotal_paise - commission_paise` | What the organizer receives |

**Example (10 tickets at ₹450, 10% commission, 2% convenience fee):**

| Field | Value |
|-------|-------|
| Subtotal | ₹4,50,000 |
| Commission (10%) | ₹45,000 |
| Convenience fee (2%) | ₹9,000 |
| Platform revenue | ₹54,000 |
| Organizer payout | ₹4,05,000 |
| Buyer pays | ₹4,59,000 |

**Revenue analytics count only `CONFIRMED` orders.** `PENDING_VERIFICATION`, `REJECTED`, `CANCELLED`, `EXPIRED`, `FAILED`, `REFUNDED`, and `REFUND_REQUESTED` orders are excluded from all money calculations.
