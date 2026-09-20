# Razorpay Payment Integration — Complete Migration Plan

Replace all manual UPI/UTR payment verification with Razorpay Checkout for paid ticket bookings and Front Row/Boost purchases, including webhook-driven confirmation, inventory reservation, invoice generation, organizer revenue reporting, and admin reconciliation.

---

## Decisions (Confirmed with User)

| Decision | Answer |
|---|---|
| Razorpay account owner | **Outsiderr** (single account, all payments settle to Outsiderr) |
| Scope — Phase 1 | **Ticket booking** + **Front Row / Boost** |
| Scope — Deferred | Club membership, Door staff (both hidden from release) |
| Free events | **Unchanged** — instant RSVP, no Razorpay involvement |
| Invoice format | **Enhanced HTML print page** (no PDF library needed) |
| Organizer payouts | **Manual bank transfer** by admin after events (MVP) |
| Inventory reservation | **Reserve on order create** — hold inventory for ~15 min, release on timeout/failure |
| Refund gateway fees | **Deducted from organizer** payout |
| Business entity | **Sole proprietorship** |

---

## 1. Razorpay Account Setup

### 1.1 Prerequisites

| Requirement | Details |
|---|---|
| Business type | Sole Proprietorship |
| Personal PAN | Owner's PAN card |
| Aadhaar | Front + back scan |
| Bank account | Personal savings or current account matching PAN name |
| Website | `outsiderr.in` or similar — must be live, HTTPS |
| Business category | **Entertainment & Media → Event Ticketing** |
| Email | Business email for transactional notifications |
| Phone | Owner's phone (linked to CKYC if possible) |

### 1.2 Dashboard Configuration

1. **Generate API Keys** → Settings → API Keys
   - `RAZORPAY_KEY_ID` (public, starts with `rzp_test_` or `rzp_live_`)
   - `RAZORPAY_KEY_SECRET` (private, server-only)
2. **Create Webhook** → Settings → Webhooks
   - URL: `https://outsiderr.in/api/razorpay/webhook`
   - Secret: Generate a strong secret → `RAZORPAY_WEBHOOK_SECRET`
   - Events to subscribe:
     - `payment.authorized`
     - `payment.captured`
     - `payment.failed`
     - `order.paid`
     - `refund.created`
     - `refund.processed`
     - `refund.failed`
3. **Payment Capture Settings** → Set to **Auto-capture** (recommended for ticketing — immediate capture, no manual step)
4. **Allowed Payment Methods** → Enable all: UPI, Cards, Net Banking, Wallets, EMI (if desired)
5. **Settlement Schedule** → Default T+2 business days (Razorpay controls this)
6. **Test Mode** → Use test keys during development; switch to live keys for production

### 1.3 Environment Variables

```env
# .env (server-only)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# .env (public, for Checkout.js)
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
```

### 1.4 Legal Pages Required by Razorpay

Razorpay requires the website to have:
- **Terms & Conditions** — must include intermediary disclosure
- **Privacy Policy** — data collection and payment processing
- **Refund/Cancellation Policy** — clear policy for event cancellations
- **Contact Us** — business contact details

These pages already exist at `/legal/terms`, `/legal/privacy`, `/contact`. They must be updated to include:
- Statement that Outsiderr is an **intermediary platform** connecting event organizers and attendees
- Outsiderr collects payments on behalf of organizers and deducts a commission
- Refund policy for event cancellations, postponements, and user-initiated cancellations
- Razorpay as the payment processor

---

## 2. Payment Flow Architecture

### 2.1 New Paid Ticket Checkout Flow

```
┌──────────┐       ┌──────────────┐       ┌───────────┐
│  Browser  │       │ Next.js API  │       │ Razorpay  │
└────┬──────┘       └──────┬───────┘       └─────┬─────┘
     │                     │                     │
     │ 1. Select tier/qty  │                     │
     │ ──────────────────► │                     │
     │                     │                     │
     │                     │ 2. Server Action:    │
     │                     │  - Validate tier/qty │
     │                     │  - Calculate pricing │
     │                     │  - Lock tier (FOR UPDATE)
     │                     │  - Check inventory   │
     │                     │  - Reserve inventory (quantity_reserved += qty)
     │                     │  - Insert order as RESERVED
     │                     │  - Create Razorpay Order via API
     │                     │  - Store razorpay_order_id on order
     │                     │  - Return order + razorpay_order_id
     │ ◄────────────────── │                     │
     │                     │                     │
     │ 3. Open Razorpay Checkout modal           │
     │ ─────────────────────────────────────────► │
     │                     │                     │
     │ 4. User completes payment                 │
     │ ◄───────────────────────────────────────── │
     │ {razorpay_payment_id, razorpay_order_id, razorpay_signature}
     │                     │                     │
     │ 5. POST callback    │                     │
     │ ──────────────────► │                     │
     │                     │ 6. Verify signature  │
     │                     │    (HMAC-SHA256)     │
     │                     │ 7. If valid:         │
     │                     │    - Update order → CONFIRMED
     │                     │    - Convert reserved → sold
     │                     │    - Mint tickets    │
     │                     │    - Store payment IDs│
     │ ◄────────────────── │                     │
     │ 8. Show tickets     │                     │
     │                     │                     │
     │                     │ 9. Webhook arrives   │
     │                     │ ◄─────────────────── │
     │                     │ payment.captured     │
     │                     │ 10. Idempotent:      │
     │                     │   - If already CONFIRMED, skip
     │                     │   - If still RESERVED, confirm + mint
     │                     │   - Log webhook event│
```

### 2.2 State Machine — Orders

```
                  ┌──────────┐
  User selects    │          │
  tier + qty ───► │ RESERVED │ ◄── inventory held, razorpay_order_id set
                  │          │
                  └────┬─────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
   Payment success   Timeout     Payment failed
   (sig verified     (15 min)    (Razorpay callback
    OR webhook)                   or webhook)
          │            │            │
          ▼            ▼            ▼
    ┌───────────┐ ┌─────────┐ ┌────────┐
    │ CONFIRMED │ │ EXPIRED │ │ FAILED │
    │           │ │         │ │        │
    │ tickets   │ │ inv     │ │ inv    │
    │ minted    │ │ released│ │ released│
    └─────┬─────┘ └─────────┘ └────────┘
          │
    ┌─────┼──────────┐
    │                │
  Cancel          Refund
  (event cancel)  (admin)
    │                │
    ▼                ▼
┌───────────┐  ┌──────────┐
│ CANCELLED │  │ REFUNDED │
│ tickets   │  │ tickets  │
│ voided    │  │ voided   │
└───────────┘  └──────────┘
```

New `OrderStatus` enum:
```typescript
export type OrderStatus =
  | "RESERVED"              // NEW: inventory held, awaiting payment
  | "CONFIRMED"             // Payment verified, tickets minted
  | "EXPIRED"               // NEW: reservation timed out
  | "FAILED"                // NEW: payment failed
  | "CANCELLED"             // Event cancelled or user-cancelled
  | "REFUNDED"              // Refund processed
  | "PENDING_VERIFICATION"; // LEGACY: kept for historical data only
```

### 2.3 Free Event Flow — Unchanged

Free events continue to use `create_free_order` RPC → instant CONFIRMED + tickets minted. No Razorpay involvement.

### 2.4 Front Row / Boost Flow

Same Razorpay flow adapted for boost purchases:
1. Organizer clicks "Buy Front Row" → Server Action creates a `hero_boosts` row with status `PENDING` + Razorpay order
2. Razorpay Checkout opens
3. On success → verify signature → update boost to `ACTIVE`
4. Webhook confirms payment
5. Remove UPI QR / UTR fields from boost panel

---

## 3. Database Schema Changes

### 3.1 Alter `orders` Table

```sql
-- New columns for Razorpay integration
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_signature text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;       -- 'upi', 'card', 'netbanking', etc.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reserved_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_paise integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS convenience_fee_paise integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS organizer_payout_paise integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_number text;

-- New order statuses (extend the enum)
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'FAILED';

-- Unique constraint on Razorpay order ID (prevent duplicate orders)
CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_order_id_idx
  ON public.orders(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

-- Unique constraint on Razorpay payment ID
CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_payment_id_idx
  ON public.orders(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

-- Index for reservation expiry cleanup
CREATE INDEX IF NOT EXISTS orders_reservation_expires_idx
  ON public.orders(reservation_expires_at)
  WHERE status = 'RESERVED';
```

**Legacy columns retained:**
- `utr_reference` — kept for historical data, not used in new flows
- `payment_proof_url` — kept for historical data, not used in new flows
- `PENDING_VERIFICATION` enum value — kept for historical orders

### 3.2 Alter `ticket_tiers` Table

```sql
-- Track reserved (held but not yet paid) inventory separately
ALTER TABLE public.ticket_tiers ADD COLUMN IF NOT EXISTS quantity_reserved integer NOT NULL DEFAULT 0;
```

Available tickets formula becomes:
```
available = quantity - quantity_sold - quantity_reserved
```

### 3.3 New `webhook_events` Table

```sql
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_event_id text     NOT NULL UNIQUE,  -- Razorpay event ID for idempotency
  event_type      text        NOT NULL,         -- 'payment.captured', 'refund.processed', etc.
  payload         jsonb       NOT NULL,         -- Full webhook payload
  order_id        uuid        REFERENCES public.orders(id),
  processed       boolean     NOT NULL DEFAULT false,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS webhook_events_razorpay_event_idx ON public.webhook_events(razorpay_event_id);
CREATE INDEX IF NOT EXISTS webhook_events_order_idx ON public.webhook_events(order_id);
CREATE INDEX IF NOT EXISTS webhook_events_unprocessed_idx ON public.webhook_events(processed) WHERE NOT processed;
```

### 3.4 New `payment_ledger` Table

```sql
CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid        REFERENCES public.orders(id),
  event_id            uuid        REFERENCES public.events(id),
  organizer_id        uuid        REFERENCES public.organizers(id),
  type                text        NOT NULL CHECK (type IN (
    'TICKET_SALE', 'BOOST_SALE', 'REFUND', 'PAYOUT', 'ADJUSTMENT'
  )),
  gross_amount_paise      integer NOT NULL,
  commission_paise        integer NOT NULL DEFAULT 0,
  convenience_fee_paise   integer NOT NULL DEFAULT 0,
  razorpay_fee_paise      integer NOT NULL DEFAULT 0, -- Razorpay's processing fee (informational)
  refund_amount_paise     integer NOT NULL DEFAULT 0,
  net_organizer_paise     integer NOT NULL DEFAULT 0,
  net_platform_paise      integer NOT NULL DEFAULT 0,
  razorpay_payment_id     text,
  razorpay_refund_id      text,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_event_idx ON public.payment_ledger(event_id);
CREATE INDEX IF NOT EXISTS ledger_organizer_idx ON public.payment_ledger(organizer_id);
CREATE INDEX IF NOT EXISTS ledger_order_idx ON public.payment_ledger(order_id);
```

### 3.5 New `payout_records` Table

```sql
CREATE TABLE IF NOT EXISTS public.payout_records (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id      uuid        NOT NULL REFERENCES public.organizers(id),
  event_id          uuid        REFERENCES public.events(id),  -- NULL = cross-event payout
  amount_paise      integer     NOT NULL,
  status            text        NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  bank_reference    text,       -- NEFT/IMPS reference
  notes             text,
  initiated_by      uuid        REFERENCES auth.users(id),
  initiated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS payout_organizer_idx ON public.payout_records(organizer_id);
CREATE INDEX IF NOT EXISTS payout_event_idx ON public.payout_records(event_id);
```

### 3.6 Alter `hero_boosts` Table

```sql
ALTER TABLE public.hero_boosts ADD COLUMN IF NOT EXISTS razorpay_order_id text;
ALTER TABLE public.hero_boosts ADD COLUMN IF NOT EXISTS razorpay_payment_id text;

CREATE UNIQUE INDEX IF NOT EXISTS hero_boosts_razorpay_order_idx
  ON public.hero_boosts(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
```

### 3.7 Alter `refunds` Table

```sql
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS razorpay_refund_id text;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS refund_type text DEFAULT 'FULL'
  CHECK (refund_type IN ('FULL', 'PARTIAL'));
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS initiated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS gateway_fee_paise integer NOT NULL DEFAULT 0;
```

### 3.8 Invoice Number Sequence

```sql
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 10001;
```

Invoice format: `OUT-{YYYYMM}-{seq}` e.g. `OUT-202609-10001`

---

## 4. New and Modified RPCs

### 4.1 `create_reserved_order` (NEW — replaces `create_paid_order` for new flow)

```sql
CREATE OR REPLACE FUNCTION public.create_reserved_order(
  p_event_id            uuid,
  p_tier_id             uuid,
  p_quantity            integer,
  p_unit_price_paise    integer,
  p_subtotal_paise      integer,
  p_platform_fee_paise  integer,
  p_commission_paise    integer,
  p_convenience_fee_paise integer,
  p_organizer_payout_paise integer,
  p_total_paise         integer,
  p_fee_payer           text,
  p_buyer_name          text DEFAULT NULL,
  p_buyer_phone         text DEFAULT NULL,
  p_buyer_email         text DEFAULT NULL,
  p_buyer_gender        text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order   public.orders;
  v_tier    public.ticket_tiers;
  v_event   public.events;
  v_existing_count integer;
BEGIN
  -- Lock the tier row
  SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket tier not found'; END IF;
  IF v_tier.price_paise = 0 THEN RAISE EXCEPTION 'Use free order for free tickets'; END IF;

  -- Check available inventory (sold + reserved)
  IF v_tier.quantity - v_tier.quantity_sold - v_tier.quantity_reserved < p_quantity THEN
    RAISE EXCEPTION 'Not enough tickets available';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;

  -- Prevent double booking
  SELECT count(*) INTO v_existing_count
  FROM public.orders
  WHERE event_id = p_event_id AND user_id = auth.uid()
    AND status IN ('CONFIRMED', 'RESERVED');
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'You already have an active booking for this event';
  END IF;

  -- Reserve inventory
  UPDATE public.ticket_tiers
     SET quantity_reserved = quantity_reserved + p_quantity
   WHERE id = p_tier_id;

  -- Insert order as RESERVED
  INSERT INTO public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise,
    commission_paise, convenience_fee_paise, organizer_payout_paise,
    total_paise, fee_payer, status,
    buyer_name, buyer_phone, buyer_email, buyer_gender,
    reserved_at, reservation_expires_at
  ) VALUES (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    p_unit_price_paise, p_subtotal_paise, p_platform_fee_paise,
    p_commission_paise, p_convenience_fee_paise, p_organizer_payout_paise,
    p_total_paise, p_fee_payer, 'RESERVED',
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
    now(), now() + interval '15 minutes'
  ) RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;
```

### 4.2 `confirm_razorpay_order` (NEW — called after signature verification or webhook)

```sql
CREATE OR REPLACE FUNCTION public.confirm_razorpay_order(
  p_order_id            uuid,
  p_razorpay_payment_id text,
  p_razorpay_signature  text,
  p_payment_method      text DEFAULT NULL
)
RETURNS SETOF public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order  public.orders;
  v_tier   public.ticket_tiers;
  v_invoice text;
BEGIN
  -- Lock the order
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- Idempotency: if already confirmed, return existing tickets
  IF v_order.status = 'CONFIRMED' THEN
    RETURN QUERY SELECT * FROM public.tickets WHERE order_id = p_order_id;
    RETURN;
  END IF;

  IF v_order.status <> 'RESERVED' THEN
    RAISE EXCEPTION 'Order is %, cannot confirm', v_order.status;
  END IF;

  -- Lock tier and convert reservation to sold
  SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = v_order.tier_id FOR UPDATE;
  UPDATE public.ticket_tiers
     SET quantity_reserved = GREATEST(quantity_reserved - v_order.quantity, 0),
         quantity_sold = quantity_sold + v_order.quantity
   WHERE id = v_order.tier_id;

  -- Generate invoice number
  v_invoice := 'OUT-' || to_char(now(), 'YYYYMM') || '-' || nextval('invoice_number_seq');

  -- Update order to CONFIRMED
  UPDATE public.orders
     SET status = 'CONFIRMED',
         razorpay_payment_id = p_razorpay_payment_id,
         razorpay_signature = p_razorpay_signature,
         payment_method = p_payment_method,
         confirmed_at = now(),
         invoice_number = v_invoice
   WHERE id = p_order_id;

  -- Update event registration count
  UPDATE public.events
     SET registrations_count = registrations_count + v_order.quantity
   WHERE id = v_order.event_id;

  -- Mint tickets
  RETURN QUERY
    INSERT INTO public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
    SELECT
      v_order.id, v_order.event_id, v_order.tier_id, v_order.user_id,
      encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
    FROM generate_series(1, v_order.quantity) g
    RETURNING *;
END;
$$;
```

### 4.3 `expire_reserved_orders` (NEW — cron/scheduled cleanup)

```sql
CREATE OR REPLACE FUNCTION public.expire_reserved_orders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_order record;
BEGIN
  FOR v_order IN
    SELECT id, tier_id, quantity FROM public.orders
    WHERE status = 'RESERVED' AND reservation_expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders SET status = 'EXPIRED' WHERE id = v_order.id;
    UPDATE public.ticket_tiers
       SET quantity_reserved = GREATEST(quantity_reserved - v_order.quantity, 0)
     WHERE id = v_order.tier_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
```

This should be called via:
- A **Supabase pg_cron** job every 1 minute: `SELECT public.expire_reserved_orders();`
- OR a Next.js API route `/api/cron/expire-reservations` called by Vercel Cron or similar

### 4.4 `fail_razorpay_order` (NEW)

```sql
CREATE OR REPLACE FUNCTION public.fail_razorpay_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_order.status <> 'RESERVED' THEN RETURN; END IF;

  UPDATE public.orders SET status = 'FAILED' WHERE id = p_order_id;
  UPDATE public.ticket_tiers
     SET quantity_reserved = GREATEST(quantity_reserved - v_order.quantity, 0)
   WHERE id = v_order.tier_id;
END;
$$;
```

### 4.5 Update `cancel_event` RPC

The existing `cancel_event` RPC must be updated to also:
- Cancel `RESERVED` orders (release reserved inventory)
- Initiate Razorpay refunds for `CONFIRMED` orders (store `razorpay_payment_id` on refund records)
- The actual Razorpay refund API call happens in application code after the RPC returns

---

## 5. API Routes

### 5.1 `src/app/api/razorpay/webhook/route.ts` (NEW)

```
POST /api/razorpay/webhook
```

**Responsibilities:**
1. Read raw request body (do NOT parse JSON before signature verification)
2. Verify HMAC-SHA256 signature using `RAZORPAY_WEBHOOK_SECRET`
3. Parse JSON payload
4. Check `razorpay_event_id` against `webhook_events` table for idempotency
5. Process event:
   - `payment.captured` / `order.paid` → call `confirm_razorpay_order` if order is still `RESERVED`
   - `payment.failed` → call `fail_razorpay_order`
   - `refund.processed` → update refund status to `COMPLETED`
   - `refund.failed` → update refund status to `FAILED`, alert admin
6. Insert into `webhook_events` table
7. Return `200 OK` (always return 200 after signature verification to prevent retries)

**Critical implementation details:**
- Use `export const runtime = 'nodejs'` (not Edge — need `crypto` for HMAC)
- Read body as `await request.text()` NOT `await request.json()`
- Signature verification:
  ```typescript
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex');
  const isValid = signature === expectedSignature;
  ```
- Use Supabase **service role key** for webhook handler (no user auth context)
- All state transitions must be idempotent

### 5.2 `src/app/api/cron/expire-reservations/route.ts` (NEW)

```
GET /api/cron/expire-reservations
```

**Responsibilities:**
- Verify cron secret header (prevent unauthorized calls)
- Call `expire_reserved_orders()` RPC
- Return count of expired orders
- Called every 1 minute by Vercel Cron or pg_cron

---

## 6. Server Actions Changes

### 6.1 `src/actions/orders.ts` — Modify `submitPaymentAction`

**Current:** Requires UTR, optionally uploads screenshot, calls `createOrder` (which calls `create_paid_order` RPC).

**New:** Rename to `createCheckoutAction`:
1. Validate form data (tier, quantity, buyer info)
2. Calculate pricing using `calculatePrice`
3. Call `create_reserved_order` RPC → get internal `order_id`
4. Create Razorpay order via server-side SDK:
   ```typescript
   const razorpayOrder = await razorpay.orders.create({
     amount: price.totalPaise,
     currency: 'INR',
     receipt: order.id,
     notes: { event_id: eventId, tier_id: tierId, order_id: order.id },
     payment: { capture: 'automatic', capture_options: { automatic_expiry_period: 15 } }
   });
   ```
5. Update order with `razorpay_order_id`
6. Return `{ orderId, razorpayOrderId, amount, currency, keyId }` to client

### 6.2 `src/actions/orders.ts` — New `verifyPaymentAction`

Called after Razorpay Checkout returns successfully:
1. Receive `{ razorpay_payment_id, razorpay_order_id, razorpay_signature }`
2. Verify signature server-side:
   ```typescript
   const body = razorpay_order_id + '|' + razorpay_payment_id;
   const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');
   if (expected !== razorpay_signature) throw new Error('Invalid payment signature');
   ```
3. Look up internal order by `razorpay_order_id`
4. Validate `amount` matches order total (fetch order from Razorpay API to double-check)
5. Call `confirm_razorpay_order` RPC
6. Insert ledger entry
7. Revalidate paths
8. Return success + redirect URL

### 6.3 `src/actions/orders.ts` — New `handlePaymentFailureAction`

Called when Razorpay Checkout fires the `modal.dismissed` or payment failure:
1. Look up order by `razorpay_order_id`
2. If still `RESERVED`, call `fail_razorpay_order` RPC
3. Release inventory

### 6.4 `src/actions/hero-boosts.ts` — Modify for Razorpay

Replace UTR-based boost purchase with:
1. Create `hero_boosts` row with `PENDING` status + Razorpay order
2. On payment success → verify signature → update to `ACTIVE`
3. On payment failure → update to `FAILED`

### 6.5 `src/actions/admin.ts` — New refund actions

- `initiateRefundAction(orderId, amount?, reason)` — calls Razorpay Refunds API, creates refund record
- `recordPayoutAction(organizerId, eventId, amount, bankReference)` — records manual payout

---

## 7. Server-Side Razorpay Client

### 7.1 `src/lib/razorpay.ts` (NEW)

```typescript
import "server-only";
import Razorpay from "razorpay";

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});
```

**NPM dependency:** `razorpay` (official Node.js SDK)

---

## 8. Client-Side Changes

### 8.1 `src/components/checkout/razorpay-checkout.tsx` (NEW)

Client component that:
1. Loads Razorpay Checkout script (`https://checkout.razorpay.com/v1/checkout.js`)
2. Receives `razorpayOrderId`, `amount`, `keyId`, `orderId` as props
3. Opens Razorpay modal with configuration:
   ```typescript
   const options = {
     key: keyId,
     amount,
     currency: 'INR',
     name: 'Outsiderr',
     description: `${eventTitle} — ${tierName} x ${quantity}`,
     order_id: razorpayOrderId,
     prefill: { name: buyerName, email: buyerEmail, contact: buyerPhone },
     theme: { color: '#8b5cf6' }, // violet-neon
     handler: async (response) => {
       // Call verifyPaymentAction
       await verifyPayment(response);
       router.push('/tickets?success=true');
     },
     modal: {
       ondismiss: () => {
         // Call handlePaymentFailureAction
         handleFailure();
       }
     }
   };
   const rzp = new window.Razorpay(options);
   rzp.open();
   ```
4. Shows loading state while verifying
5. Handles errors gracefully

### 8.2 `src/components/checkout/checkout-form.tsx` — Major Rewrite

**Remove:**
- UTR input field
- Payment screenshot upload
- WhatsApp payment proof instructions
- UPI QR display
- "I've paid — submit for verification" button

**Replace with:**
- Order summary showing: tier name, quantity, unit price, subtotal, convenience fee, total
- Legal disclaimer: "Payment processed by Razorpay. Outsiderr acts as an intermediary platform."
- "Pay {total}" button → triggers `createCheckoutAction` → opens Razorpay modal
- Payment status indicator (processing, success, failure)
- Retry button on failure

### 8.3 `src/app/checkout/page.tsx` — Modify

**Remove:**
- UPI QR code generation
- UPI intent links
- WhatsApp payment instructions section
- References to `src/lib/upi.ts`

**Keep:**
- Pricing calculation display
- Event/tier details
- Buyer info collection (name, phone, email, gender)

**Add:**
- Razorpay Checkout component integration
- Post-payment redirect handling

### 8.4 `src/components/organizer/verification-queue.tsx` — Remove/Replace

**Remove entirely** for new orders. Organizers no longer verify payments.

**Replace with:** `src/components/organizer/order-monitor.tsx`
- Shows all orders for organizer's events
- Filterable by status: Confirmed, Reserved (pending payment), Failed, Expired
- Shows: buyer name, tier, quantity, amount, payment method, Razorpay payment ID, timestamp
- Read-only — no approve/reject actions
- Real-time updates via Supabase Realtime

### 8.5 `src/components/organizer/hero-boost-panel.tsx` — Modify

**Remove:**
- UPI QR code display
- UTR input field
- "Admin will verify your UTR" messaging

**Replace with:**
- "Buy Front Row — {price}" button
- Razorpay Checkout modal for boost payment
- Payment status tracking

### 8.6 `src/components/organizer/boost-panel.tsx` — Modify

Same changes as hero-boost-panel.

### 8.7 `src/app/tickets/[id]/print/page.tsx` — Enhance (Invoice)

**Add to the existing print page:**
- Invoice number (`OUT-YYYYMM-XXXXX`)
- Order ID (short form)
- Razorpay Payment ID
- Payment method used
- Fee breakdown:
  - Ticket price x quantity = Subtotal
  - Convenience fee (X%) = amount
  - Total paid = amount
- Payment date/time
- Legal text:
  > "Outsiderr is an intermediary platform connecting event organizers and attendees.
  > A commission is deducted from the organizer's payout. The convenience fee covers
  > platform and payment processing costs. This is not a tax invoice.
  > For refund policy, visit outsiderr.in/legal/terms."
- Organizer details (name, contact email)
- Event details (title, date, venue, city)

### 8.8 Ticket Card — Minor Enhancement

Add a small "Receipt" or "Invoice" link in the expanded modal that links to the print page. Already has "Print ticket" — this is sufficient.

---

## 9. Organizer Experience Changes

### 9.1 Organizer Dashboard

**Remove:**
- Verification queue / pending approvals count
- "X orders pending verification" badge

**Add:**
- "Revenue" section showing:
  - Total confirmed orders
  - Gross ticket sales
  - Platform commission deducted
  - Convenience fee collected
  - Net payout amount
  - Payout status (Pending / Processing / Completed)

### 9.2 Event Report Page (`/organizer/events/[id]/report`)

**Current:** Shows gross revenue, "Platform fee (5%)", pending verification count, UTR references.

**Update to show:**
- Gross ticket sales (sum of subtotals)
- Platform commission (−X%)
- Convenience fee collected (separate line)
- Razorpay processing fee (informational — Razorpay deducts this from settlement)
- Net organizer payout
- Payout status and date
- Refunds issued (count and amount)
- Remove UTR column from order list
- Add Payment ID and Payment Method columns
- Remove "Pending verification" section

### 9.3 Organizer Profile — Bank Details

Already has fields: `bank_account_number`, `bank_ifsc`, `bank_account_name`, `bank_account_type`.

**Add guidance:**
- Make bank details required before publishing paid events
- Show "Bank details required for receiving payouts" prompt
- Validate IFSC format (11 chars, alpha + numeric)

---

## 10. Admin Experience Changes

### 10.1 Admin Orders Page (`/admin/orders`)

**Remove:**
- Approve / Reject buttons for new orders (keep for legacy `PENDING_VERIFICATION` orders)
- Bulk approve panel (keep for legacy)
- UTR display column

**Add:**
- Filter tabs: All | Reserved | Confirmed | Failed | Expired | Refunded
- Razorpay Payment ID column
- Payment Method column
- "Initiate Refund" button on confirmed orders (opens refund dialog)
- Refund dialog: amount (default: full), reason, confirm
- Reconciliation status indicator

### 10.2 New Admin Page: Payment Reconciliation (`/admin/payments`)

**Purpose:** Monitor webhook health and payment reconciliation.

**Shows:**
- Recent webhook events (last 100)
- Failed/unprocessed webhooks with error details
- Retry button for failed webhooks
- Orders with `RESERVED` status older than 15 minutes (should be expired)
- Orders confirmed by webhook vs. callback
- Daily/weekly settlement summary
- Razorpay dashboard link

### 10.3 New Admin Page: Organizer Payouts (`/admin/payouts`)

**Purpose:** Track and record manual payouts to organizers.

**Shows:**
- Organizers with outstanding balances
- Per-event payout details: gross, commission, convenience fee, refunds, net owed
- "Record Payout" button → enter amount, bank reference, notes
- Payout history with status

### 10.4 Admin Boosts Page (`/admin/boosts`)

**Update:**
- Remove UTR verification for boost payments
- Show Razorpay Payment ID instead
- Auto-activate boosts on payment confirmation

---

## 11. Webhook Verification & Security

### 11.1 Signature Verification

```typescript
import crypto from 'crypto';

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}
```

### 11.2 Payment Signature Verification (Checkout callback)

```typescript
export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  const body = orderId + '|' + paymentId;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}
```

### 11.3 Idempotency

- Each webhook event has a unique `event_id` from Razorpay
- Before processing, check `webhook_events` table for existing `razorpay_event_id`
- If found and `processed = true`, return 200 immediately
- The `confirm_razorpay_order` RPC is also idempotent (returns existing tickets if already confirmed)

### 11.4 Race Condition: Callback vs. Webhook

Both the client callback (`verifyPaymentAction`) and the webhook may try to confirm the same order simultaneously.

**Resolution:** The `confirm_razorpay_order` RPC uses `SELECT ... FOR UPDATE` on the order row. Whichever arrives first will:
1. See status = `RESERVED` → confirm + mint tickets
2. The second caller sees status = `CONFIRMED` → returns existing tickets (idempotent)

No double-minting is possible because of the row lock + status check.

### 11.5 Never Trust Client-Side

- The client callback provides convenience (immediate success UX)
- But the server MUST verify the signature before confirming
- If signature verification fails, the order stays `RESERVED` and will be handled by webhook or expire
- Razorpay recommends treating webhooks as the source of truth

---

## 12. Atomicity & Integrity Guarantees

| Scenario | Handling |
|---|---|
| Double click on "Pay" | `create_reserved_order` checks for existing RESERVED/CONFIRMED order for same user+event |
| Two users race for last ticket | `quantity_reserved` incremented under `FOR UPDATE` lock — second user gets "Not enough tickets" |
| Payment succeeds but browser closes | Webhook fires `payment.captured` → `confirm_razorpay_order` confirms + mints tickets |
| Webhook arrives before callback | Webhook confirms order. When callback arrives, RPC returns existing tickets (idempotent) |
| Callback arrives before webhook | Callback confirms order. When webhook arrives, idempotency check skips processing |
| Payment fails | `fail_razorpay_order` releases reserved inventory |
| User abandons checkout (modal dismissed) | `handlePaymentFailureAction` releases inventory immediately. Backup: `expire_reserved_orders` cron releases after 15 min |
| Razorpay order created but payment never attempted | `expire_reserved_orders` cron releases after 15 min |
| Amount tampered on client | Server-side signature verification ensures amount matches. Additionally, `verifyPaymentAction` fetches order from Razorpay API to confirm amount matches internal total |
| Concurrent event cancellation during payment | `cancel_event` RPC now handles `RESERVED` orders too — releases inventory, marks as CANCELLED |

---

## 13. Notifications

### 13.1 Notification Events

| Event | Channel | Recipient |
|---|---|---|
| Payment successful | In-app notification + Realtime | Buyer |
| Ticket generated | In-app (tickets wallet updates via Realtime) | Buyer |
| Payment failed | In-app notification | Buyer |
| Reservation expired | In-app notification | Buyer |
| Refund initiated | In-app notification | Buyer |
| Refund completed | In-app notification | Buyer |
| Refund failed | In-app notification | Buyer + Admin |
| Event cancelled | In-app notification (existing) | All ticket holders |
| Event postponed | In-app notification (existing) | All ticket holders |
| New confirmed order | Realtime update on organizer dashboard | Organizer |
| Payout completed | In-app notification | Organizer |
| Webhook processing failed | In-app notification / admin alert | Admin |

### 13.2 Implementation

- Extend `event_notification_type` enum:
  ```sql
  ALTER TYPE event_notification_type ADD VALUE IF NOT EXISTS 'PAYMENT_SUCCESS';
  ALTER TYPE event_notification_type ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
  ALTER TYPE event_notification_type ADD VALUE IF NOT EXISTS 'REFUND_INITIATED';
  ALTER TYPE event_notification_type ADD VALUE IF NOT EXISTS 'REFUND_COMPLETED';
  ALTER TYPE event_notification_type ADD VALUE IF NOT EXISTS 'PAYOUT_COMPLETED';
  ```
- Realtime subscriptions on `orders` and `tickets` tables already configured
- New notifications inserted by RPCs and server actions

---

## 14. Pricing & Fee Architecture

### 14.1 Current Model (Preserved)

```
Buyer pays:      subtotal + convenience_fee
Organizer gets:  subtotal - commission
Platform keeps:  commission + convenience_fee
```

- Commission: tiered (10% for orders up to ₹500, 7% for ₹500-₹3000, 5% above ₹3000)
- Convenience fee: 2% (configurable by admin)
- Free events: zero fees, zero commission

### 14.2 Razorpay Fee Treatment

Razorpay charges ~2% processing fee on each transaction. This is deducted from Razorpay's settlement to Outsiderr.

- Razorpay fee is NOT shown to the buyer (buyer pays the same total)
- Razorpay fee is NOT explicitly deducted from organizer payout
- Razorpay fee reduces Outsiderr's net margin from the commission + convenience fee
- The `razorpay_fee_paise` in the ledger is informational, populated from Razorpay's payment entity after capture

### 14.3 Refund Fee Treatment (per user decision)

When a refund occurs:
- Buyer gets full refund of `total_paise`
- Razorpay may not refund their processing fee (depends on Razorpay's policy)
- Any non-refundable gateway fee is tracked as `gateway_fee_paise` on the refund record
- This amount is deducted from the organizer's net payout
- The ledger records a `REFUND` entry showing the deduction

### 14.4 Immutable Price Snapshots

All pricing fields are stored on the order at creation time:
- `unit_price_paise`, `subtotal_paise`, `commission_paise`, `convenience_fee_paise`, `platform_fee_paise`, `organizer_payout_paise`, `total_paise`
- Changing platform settings (commission %, convenience fee %) does NOT affect existing orders
- The Razorpay order is created with `amount = total_paise` — this is immutable

---

## 15. Files to Create

| File | Purpose |
|---|---|
| `src/lib/razorpay.ts` | Server-side Razorpay client instance |
| `src/lib/razorpay-verify.ts` | Signature verification utilities |
| `src/app/api/razorpay/webhook/route.ts` | Webhook handler |
| `src/app/api/cron/expire-reservations/route.ts` | Reservation expiry cron |
| `src/components/checkout/razorpay-checkout.tsx` | Client-side Razorpay Checkout component |
| `src/components/organizer/order-monitor.tsx` | Replaces verification-queue |
| `src/app/admin/payments/page.tsx` | Payment reconciliation dashboard |
| `src/app/admin/payouts/page.tsx` | Organizer payout tracking |

## 16. Files to Modify

| File | Changes |
|---|---|
| `package.json` | Add `razorpay` dependency |
| `.env.example` | Add Razorpay env vars |
| `supabase/schema.sql` | All schema changes from Section 3 |
| `supabase/migrations/fix_all.sql` | Migration ALTER statements |
| `src/lib/supabase/database.types.ts` | Update generated types |
| `src/lib/types.ts` | Update `OrderStatus`, add `PaymentLedger`, `PayoutRecord`, `WebhookEvent` types |
| `src/lib/pricing.ts` | Add `commissionPaise`, `convenienceFeePaise`, `organizerPayoutPaise` to return type |
| `src/actions/orders.ts` | Replace `submitPaymentAction` with `createCheckoutAction` + `verifyPaymentAction` |
| `src/actions/hero-boosts.ts` | Replace UTR flow with Razorpay flow |
| `src/actions/admin.ts` | Add refund + payout actions |
| `src/lib/data/orders.ts` | Update `CreateOrderInput`, add Razorpay fields to hydration |
| `src/lib/data/admin.ts` | Add webhook, ledger, payout data access functions |
| `src/components/checkout/checkout-form.tsx` | Remove UTR/screenshot, add Razorpay checkout trigger |
| `src/app/checkout/page.tsx` | Remove UPI QR/WhatsApp, integrate Razorpay flow |
| `src/components/organizer/hero-boost-panel.tsx` | Remove UPI/UTR, add Razorpay |
| `src/components/organizer/boost-panel.tsx` | Remove UPI/UTR, add Razorpay |
| `src/components/organizer/verification-queue.tsx` | Replace with order-monitor or remove |
| `src/app/organizer/events/[id]/report/page.tsx` | Update revenue report (remove UTR, add payment IDs, payout info) |
| `src/app/admin/orders/page.tsx` | Remove approve/reject for new orders, add refund, update filters |
| `src/app/admin/boosts/page.tsx` | Remove UTR verification, add payment IDs |
| `src/app/tickets/[id]/print/page.tsx` | Add invoice details, fee breakdown, legal text |
| `src/app/list-your-event/page.tsx` | Update "Manual UPI payments" feature to "Secure payments via Razorpay" |
| `src/lib/constants.ts` | Add reservation timeout, Razorpay-related constants |
| `src/lib/upi.ts` | Deprecate (keep for reference, remove imports) |
| `next.config.ts` | No changes needed |
| `AGENTS.md` | Document Razorpay env vars requirement |
| `BACKLOG.md` | Add Razorpay migration entry |

## 17. Files to Deprecate/Remove

| File | Status |
|---|---|
| `src/lib/upi.ts` | **Deprecate** — remove all imports, keep file briefly for reference, then delete |
| `src/components/organizer/verification-queue.tsx` | **Replace** with `order-monitor.tsx` |
| `src/components/admin/bulk-approve-panel.tsx` | **Keep temporarily** for legacy `PENDING_VERIFICATION` orders, remove when all are resolved |

---

## 18. Testing Strategy

### 18.1 Unit Tests

| Test | File |
|---|---|
| Price calculation with commission + convenience fee | `src/lib/__tests__/pricing.test.ts` |
| Razorpay payment signature verification | `src/lib/__tests__/razorpay-verify.test.ts` |
| Razorpay webhook signature verification | `src/lib/__tests__/razorpay-verify.test.ts` |
| Invoice number generation | `src/lib/__tests__/invoice.test.ts` |

### 18.2 Integration Tests

| Test | Description |
|---|---|
| Webhook idempotency | Send same webhook event twice → order confirmed only once, one set of tickets |
| State machine transitions | RESERVED → CONFIRMED, RESERVED → EXPIRED, RESERVED → FAILED, CONFIRMED → REFUNDED |
| Invalid signature rejection | Webhook with wrong signature → 401, no state change |
| Concurrent booking | Two requests for last ticket → one succeeds, one fails |
| Reservation expiry | Create RESERVED order, wait > 15 min (or mock time), verify expired + inventory released |
| Double booking prevention | Same user, same event → second attempt blocked |
| Amount mismatch | Razorpay payment amount != order total → rejection |

### 18.3 Playwright E2E Tests

| Test | Flow |
|---|---|
| Paid checkout happy path | Select tier → Pay → Razorpay test mode → Verify ticket in wallet |
| Paid checkout failure | Select tier → Pay → Cancel modal → Verify inventory released |
| Free RSVP unchanged | Book free event → Instant ticket → No Razorpay involvement |
| Front Row purchase | Organizer buys boost → Razorpay payment → Boost activated |
| Organizer dashboard | Verify revenue report shows correct breakdown |
| Admin refund | Admin initiates refund → Verify order status → Verify refund record |
| Invoice/receipt | Book paid event → View print page → Verify fee breakdown + legal text |

**Razorpay Test Mode:** All E2E tests use Razorpay test keys. Test card: `4111 1111 1111 1111`, test UPI: `success@razorpay`.

### 18.4 Security Tests

- Webhook endpoint rejects requests without valid signature
- `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` never exposed to browser
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the only Razorpay value in client bundles
- RLS policies prevent users from reading other users' payment details
- Admin-only access to refund, payout, and reconciliation functions

### 18.5 Build Verification

```bash
npx next build
```

Must pass with zero type errors after all changes.

---

## 19. Implementation Order (Phases)

### Phase 1: Foundation (Backend)
1. Install `razorpay` npm package
2. Add env vars to `.env.example`
3. Create `src/lib/razorpay.ts` (server client)
4. Create `src/lib/razorpay-verify.ts` (signature utils)
5. Apply all database schema changes (schema.sql + fix_all.sql + database.types.ts)
6. Create new RPCs: `create_reserved_order`, `confirm_razorpay_order`, `fail_razorpay_order`, `expire_reserved_orders`
7. Update `cancel_event` RPC for new statuses

### Phase 2: Ticket Checkout (Core Flow)
8. Create `createCheckoutAction` + `verifyPaymentAction` + `handlePaymentFailureAction` in orders.ts
9. Update `src/lib/data/orders.ts` (new input types, Razorpay fields)
10. Create `src/components/checkout/razorpay-checkout.tsx`
11. Rewrite `src/components/checkout/checkout-form.tsx`
12. Update `src/app/checkout/page.tsx`
13. Update `src/lib/types.ts` with new statuses and types

### Phase 3: Webhook + Cron
14. Create `/api/razorpay/webhook/route.ts`
15. Create `/api/cron/expire-reservations/route.ts`
16. Set up pg_cron or Vercel Cron for reservation expiry

### Phase 4: Organizer UI
17. Create `order-monitor.tsx` (replaces verification-queue)
18. Update organizer event report page
19. Update organizer dashboard (remove verification queue references)

### Phase 5: Front Row / Boost
20. Update `hero-boost-panel.tsx` for Razorpay
21. Update `boost-panel.tsx` for Razorpay
22. Update `src/actions/hero-boosts.ts` and `src/actions/boosts.ts`

### Phase 6: Admin
23. Update admin orders page (remove approve/reject for new, add refund)
24. Create admin payments/reconciliation page
25. Create admin payouts page
26. Add refund and payout server actions

### Phase 7: Invoice & Legal
27. Enhance ticket print page with invoice details
28. Update legal pages with intermediary disclosure
29. Update "List Your Event" page messaging

### Phase 8: Notifications
30. Add new notification types
31. Insert notifications on payment success/failure/refund

### Phase 9: Cleanup & Testing
32. Deprecate/remove UPI references
33. Write unit tests
34. Write integration tests
35. Write/update Playwright E2E tests
36. Run `npx next build` — zero errors
37. Manual testing in Razorpay test mode

---

## 20. Risks & Considerations

| Risk | Mitigation |
|---|---|
| Razorpay KYC approval delay | Apply early with complete documents. Use test mode for development. |
| Webhook delivery failures | `webhook_events` table tracks all events. Admin reconciliation page shows unprocessed events. Manual retry available. |
| Reservation holding inventory unnecessarily | 15-minute timeout with cron cleanup. Short enough to not block real buyers, long enough for payment completion. |
| Legacy `PENDING_VERIFICATION` orders | Keep old approve/reject flow for existing orders until all are resolved. Bulk-resolve remaining legacy orders. |
| Razorpay downtime | Graceful error handling. Show user-friendly message. Retry capability. Free events unaffected. |
| Tax/GST compliance | Mark as **requires professional review**. Outsiderr as sole proprietorship may need GST registration if turnover exceeds 20L (40L for goods). Intermediary status affects tax treatment. Consult CA. |
| TDS on organizer payouts | If organizer payouts exceed 30K/year, TDS may apply (Section 194-O for e-commerce operators). **Requires CA consultation.** |
| Refund timeline | Razorpay refunds take 5-10 business days. Communicate clearly to users. |
| Mobile checkout UX | Razorpay Checkout is mobile-optimized. Test on iOS Safari and Android Chrome. |
| `pg_cron` availability | Depends on Supabase plan. Alternative: Vercel Cron calling the API route. |

---

## 21. Legal Disclaimer Language

To be added to checkout, invoices, and terms pages:

> **Outsiderr is an intermediary platform** that connects event organizers with attendees.
> Outsiderr facilitates payments on behalf of event organizers through Razorpay, a
> third-party payment processor. Outsiderr is not the organizer of events listed on
> the platform. A platform commission is deducted from the organizer's payout. A
> convenience fee may be charged to cover platform and payment processing costs.
> For refund and cancellation policies, please refer to our Terms of Service.

**Note:** This language should be reviewed by a legal professional before production deployment.
