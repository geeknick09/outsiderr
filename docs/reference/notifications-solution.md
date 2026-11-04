# Notifications Solution — In-App + WhatsApp

Solution overview, high-level design (HLD), and low-level design (LLD) for the
Outsiderr notification system.

Last updated: 2025 — status: **proposal** (in-app already shipped; WhatsApp pending).

---

## 1. Goals

1. Users get timely, reliable updates about things they care about: bookings,
   payments, refunds, event changes, waitlist offers, community activity.
2. Organizers get operational alerts: orders, KYC outcomes, collaboration
   invites, payout events.
3. Two delivery channels:
   - **In-app** — the bell in the navbar (already live).
   - **WhatsApp** — high-priority transactional messages (India-first; ~95%
     open rates vs ~20% for email/SMS).
4. Notifications must **never break the primary transaction** — best-effort,
   durable, retried.

## 2. Non-goals (for now)

- Push notifications (Expo/FCM) — the channel exists in the abstraction;
  an adapter lands with the mobile app milestone.
- Email — same; magic-link auth email stays with Supabase's own provider.
- Marketing/promotional blasts via WhatsApp (marketing templates cost more
  and burn opt-ins quickly; use in-app + community posts instead).

## 3. Current state (what already exists)

| Piece | Location | Status |
|---|---|---|
| `event_notifications` table + RLS + realtime publication | `supabase/schema.sql` | Live |
| Bell UI with unread count, pagination, mark-read, realtime | `shared/ui/layout/notification-bell.tsx` | Live |
| Channel-aware abstraction `sendNotification()` / `sendNotifications()` | `shared/notifications.ts` | Live — `in-app` delivered; `push`/`email`/`whatsapp` enqueue to outbox |
| `notification_outbox` table + `enqueue_`/`claim_`/`complete_notification_outbox` RPCs | `supabase/schema.sql` | Live (durable, 24h self-expiry, retry columns) |
| Drain cron endpoint | `app/api/cron/drain-notifications/route.ts` | Skeleton — skips when no provider env; **no adapters** |
| WhatsApp | `wa.me` share links + support number only | No outbound messaging |

**Gap:** the entire "last mile" — WhatsApp provider, templates, opt-in
tracking, recipient phone resolution, and cron delivery loop.

## 4. Provider choice — WhatsApp Business Platform (Cloud API)

| Option | Verdict |
|---|---|
| **Meta Cloud API (direct)** | ✅ Recommended. Free ingress, per-message pricing, full control, no BSP markup. Needs Meta Business verification + a dedicated phone number not already on WhatsApp. |
| BSP (Interakt, Aisensy, Wati, Gupshup) | Faster onboarding + dashboards, but adds per-message markup and a vendor dashboard we'd outgrow. |
| Unofficial (whatsapp-web.js, Baileys) | ❌ Against ToS; number gets banned; not viable for a real business. |

**Cost (India, Meta per-message pricing):**
- Utility templates: ~₹0.115/msg when user-initiated window, ~₹0.80–1.25 otherwise
- Authentication templates (OTP): ~₹0.115/msg — cheaper than SMS
- Marketing templates: ~₹0.88/msg (avoid)
- **Estimated monthly cost at 5k notifications:** ₹500–1,500 — cheaper than
  any SMS route at equivalent read rates.

**Templates must be pre-approved by Meta** (usually <24h). We map every
notification type to a Utility template with `{{1}}…{{n}}` variables.

## 5. High-Level Design (HLD)

```
   Business code (orders, refunds, KYC, collab, waitlist, outreach…)
      │
      ▼
   sendNotification({ userId, type, message, eventId, channels })
      │                                  shared/notifications.ts  (exists)
      ├──────────────┬──────────────────────────┐
      ▼              ▼                          ▼
 event_notifications   notification_outbox   (future: push/email adapters)
   (in-app, RLS)         (channel='whatsapp')
      │                     │
      ▼                     ▼
 NotificationBell     cron /api/cron/drain-notifications
  (realtime sub)           │  claim_notification_outbox(batch)
                           ▼
                      WhatsApp adapter  shared/lib/notify/whatsapp.ts
                           │  resolve phone → render template → POST Cloud API
                           ▼
                      Meta WhatsApp Business Platform
                           │
                           ▼
                      User's WhatsApp (+ status webhooks → delivery receipts)
```

### Channel routing policy

| Notification type | In-app | WhatsApp | Why |
|---|---|---|---|
| ORDER_CONFIRMED / PAYMENT_SUCCESS | ✓ | ✓ | Ticket link is high-value; users need it at the venue gate |
| PAYMENT_FAILED | ✓ | ✓ | Recovery message drives conversion |
| REFUND_INITIATED / REFUND_COMPLETED | ✓ | ✓ | Money events — users watch these |
| PAYOUT_COMPLETED (organizer) | ✓ | ✓ | Money event |
| CANCELLATION / POSTPONEMENT / RESCHEDULE / VENUE_CHANGE / CITY_CHANGE / TIME_CHANGE | ✓ | ✓ | Attendance-critical |
| WAITLIST_OFFER | ✓ | ✓ | Time-boxed offer — reach matters |
| ORDER_REJECTED / PENDING_VERIFICATION | ✓ | — | In-app suffices |
| COLLAB_INVITE / COLLAB_ACCEPTED | ✓ | — | Organizer-side, low urgency |
| KYC_* (organizer) | ✓ | ✓ | Unblocks earning |
| EVENT_REMINDER (T-24h, T-2h) | ✓ | ✓ | Attendance-driving |
| TICKETS_AVAILABLE (subscriptions) | ✓ | — | Volume — keep WhatsApp for money/attendance events |
| OUTREACH / COMMUNITY_EVENT | ✓ | — | Bulk — WhatsApp would be spam + expensive |

Rule of thumb: **WhatsApp = money + attendance + account-unblocking events.
In-app = everything.** Keeps utility-template costs low and avoids spam flags.

### Delivery semantics

- `sendNotification` never throws — it logs and continues (already true).
- Outbox row is written durably; drain cron claims batches of 50, marks
  `SENDING`, delivers, then `complete_notification_outbox(success|error)`.
- `complete_` requeues failures with backoff (`next_attempt_at`), caps at
  5 attempts → `FAILED`. Rows auto-expire `EXPIRED` after 24h.
- Opt-out checked at enqueue AND at drain time (belt-and-braces; a user
  opting out between enqueue and drain must not get the message).

## 6. Low-Level Design (LLD)

### 6.1 Schema changes

```sql
-- Per-user channel preferences + WhatsApp opt-in.
create table if not exists public.notification_preferences (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  whatsapp_opt_in    boolean not null default false,
  whatsapp_opted_at  timestamptz,
  quiet_hours_start  smallint check (quiet_hours_start between 0 and 23),  -- e.g. 22
  quiet_hours_end    smallint check (quiet_hours_end between 0 and 23),    -- e.g. 8
  channels_json      jsonb not null default '{}'::jsonb,  -- per-type overrides, future
  updated_at         timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create policy "users read own prefs"  on public.notification_preferences
  for select using (auth.uid() = user_id);
create policy "users update own prefs" on public.notification_preferences
  for all using (auth.uid() = user_id);
```

`profiles.phone` already exists — it's the WhatsApp destination. Phone must
be verified (see OTP doc — send WhatsApp only to verified numbers;
`profiles.phone_verified boolean` added there).

```sql
-- WhatsApp delivery receipts (optional but cheap — powers "delivered/read"
-- in admin and lets us detect dead numbers for auto opt-out).
create table if not exists public.whatsapp_receipts (
  id              uuid primary key default gen_random_uuid(),
  outbox_id       uuid references public.notification_outbox(id) on delete cascade,
  wa_message_id   text not null,
  status          text not null,          -- sent | delivered | read | failed
  error_code      text,
  created_at      timestamptz not null default now()
);
-- service_role only
```

### 6.2 Template registry (code constants, not DB)

`shared/lib/notify/whatsapp-templates.ts`:

```ts
// Meta template names must be created + approved in the WhatsApp Manager first.
export const WA_TEMPLATES: Record<string, { name: string; params: (ctx: Ctx) => string[] }> = {
  PAYMENT_SUCCESS: {
    name: "booking_confirmed_v1",
    // "Hi {{1}}, your booking for {{2}} is confirmed! 🎟 {{3}} ticket(s) — {{4}}.
    //  Show this at the gate: {{5}}"
    params: (c) => [c.name, c.eventTitle, String(c.ticketCount), formatPaise(c.amountPaise), c.ticketUrl],
  },
  CANCELLATION:   { name: "event_cancelled_v1",   params: (c) => [c.name, c.eventTitle, c.refundNote] },
  WAITLIST_OFFER: { name: "waitlist_offer_v1",    params: (c) => [c.name, c.eventTitle, c.expiryMinutes, c.offerUrl] },
  EVENT_REMINDER: { name: "event_reminder_v1",    params: (c) => [c.name, c.eventTitle, c.venueLine, c.startTimeIST, c.ticketUrl] },
  KYC_APPROVED:   { name: "kyc_approved_v1",      params: (c) => [c.name] },
  REFUND_COMPLETED:{name: "refund_completed_v1",  params: (c) => [c.name, formatPaise(c.amountPaise), c.eventTitle] },
  // …one entry per WhatsApp-enabled type (see §5 routing)
};
```

`p_payload` on the outbox row carries the template context
(`{ eventTitle, ticketCount, ticketUrl, … }`) — enriched at enqueue time so
the drain worker doesn't re-query events.

### 6.3 Enrich `sendNotification` (small change, `shared/notifications.ts`)

```ts
// Extend SendNotificationInput
payload?: Record<string, unknown>; // template context for external channels

// enqueueOutbox passes it through:
p_payload: input.payload ?? {},
```

Callers attach context, e.g. order confirmation already knows the order:

```ts
sendNotification({
  userId: order.userId, type: "PAYMENT_SUCCESS",
  message: `Booking confirmed — ${event.title}`,
  eventId: event.id,
  channels: ["in-app", "whatsapp"],
  payload: { name: firstName, eventTitle: event.title, ticketCount, amountPaise,
             ticketUrl: `${APP_URL}/tickets` },
});
```

**Opt-in gate** inside `sendNotification`: when `channels` includes
`whatsapp`, check `notification_preferences.whatsapp_opt_in` (service-client
read, cached 60s in-process) — skip enqueue if false.

### 6.4 WhatsApp adapter — `shared/lib/notify/whatsapp.ts`

```ts
interface WaSendResult { ok: boolean; waMessageId?: string; error?: string; }

export async function sendWhatsAppTemplate(
  toE164: string,               // "+91XXXXXXXXXX"
  template: string,
  params: string[],
): Promise<WaSendResult> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WA_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164,
        type: "template",
        template: { name: template, language: { code: "en" },
          components: [{ type: "body",
            parameters: params.map((text) => ({ type: "text", text })) }] },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, waMessageId: json?.messages?.[0]?.id };
}
```

Env vars (`.env` + `.env.example`):

```
WA_PHONE_NUMBER_ID=           # from Meta App → WhatsApp → API setup
WA_BUSINESS_ACCOUNT_ID=
WA_ACCESS_TOKEN=              # permanent token via System User (not the 24h test token)
WA_VERIFY_TOKEN=              # random string, used by webhook verification
WA_APP_SECRET=                # for webhook signature verification
```

### 6.5 Drain cron update — `app/api/cron/drain-notifications/route.ts`

Replace the `hasPushProvider` gate + unreachable loop with:

```ts
const channels = {
  whatsapp: Boolean(process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN),
  push: Boolean(process.env.EXPO_ACCESS_TOKEN /* … */),
};
if (!channels.whatsapp && !channels.push) {
  return NextResponse.json({ status: "skipped", reason: "no provider configured" });
}

const { data: claimed } = await supabase.rpc("claim_notification_outbox", { p_batch: 50 });
for (const row of claimed ?? []) {
  let ok = false; let err: string | null = "unsupported channel";
  if (row.channel === "whatsapp" && channels.whatsapp) {
    const pref = await getPrefs(row.user_id);            // cached
    const phone = await getVerifiedPhone(row.user_id);   // profiles.phone + phone_verified
    const tpl = WA_TEMPLATES[row.type];
    if (!pref?.whatsapp_opt_in)      { ok = true; err = "opted-out"; }      // treated delivered → drop
    else if (!phone || !tpl)         { ok = true; err = "no-phone-or-template"; }
    else {
      const r = await sendWhatsAppTemplate(phone, tpl.name, tpl.params(row.payload));
      ok = r.ok; err = r.error ?? null;
      if (r.waMessageId) await insertReceipt(row.id, r.waMessageId, "sent");
    }
  }
  await supabase.rpc("complete_notification_outbox", {
    p_id: row.id, p_success: ok, p_error: err });
}
```

Phone normalisation: reuse `normalisePhone()` → prepend `+91` for 10-digit
IN numbers → E.164 for the API.

### 6.6 Status webhook — `app/api/whatsapp/webhook/route.ts` (new)

Meta calls this for delivery receipts (and inbound STOP replies):

```ts
// GET — webhook verification: echo hub.challenge when hub.verify_token === WA_VERIFY_TOKEN
// POST — verify X-Hub-Signature-256 (HMAC-SHA256 with WA_APP_SECRET over raw body),
//        then for each statuses[] entry → update whatsapp_receipts + outbox status.
//        Inbound "STOP"/"stop" messages → set whatsapp_opt_in = false.
```

### 6.7 Opt-in UX

- **Profile page** (`EditProfileForm`): "WhatsApp updates" toggle — requires
  verified phone; copy: "Get booking confirmations, ticket links and event
  changes on WhatsApp. Transactional only — no promotions."
- **Post-checkout**: on the order-confirmation screen, a one-tap
  "Also send my ticket on WhatsApp" → sets opt-in + immediately sends that
  booking's confirmation. Highest-converting opt-in moment.
- **Unsubscribe**: toggle off in profile, or replying `STOP` (webhook §6.6).
- Quiet hours: don't drain non-critical WhatsApp rows 22:00–08:00 IST
  (cron checks `quiet_hours_*`; money/refund rows bypass quiet hours).

### 6.8 Admin observability

- Admin → Settings: show `notification_outbox` stats (PENDING/SENT/FAILED
  last 24h) + `whatsapp_receipts` read-rate.
- `last_error` already on outbox rows — surface in `/admin` compliance tab.

## 7. Event reminder job (new)

`EVENT_REMINDER` needs a trigger — add to the existing cron workflow:

```sql
-- Daily cron (or hourly): events starting in next 26h, notify CONFIRMED buyers
select * from orders o join events e on e.id = o.event_id
 where o.status = 'CONFIRMED'
   and e.starts_at between now() + interval '25 hours' and now() + interval '26 hours';
```
Enqueues `EVENT_REMINDER` (in-app + whatsapp) with `ticketUrl` payload.

## 8. Rollout phases

| Phase | Scope | Effort |
|---|---|---|
| **P0** | Schema (`notification_preferences`), opt-in UI on profile + post-checkout | S |
| **P1** | Meta app + business verification, phone number, 5 core templates approved (booking, cancel, refund, reminder, waitlist) | External wait ~1–3 days |
| **P2** | WhatsApp adapter + drain cron wiring + payload plumbing through `sendNotification` callers | M |
| **P3** | Status webhook + receipts + STOP handling + quiet hours | S |
| **P4** | Reminder cron + admin outbox stats | S |
| **P5** | Push adapter (Expo) when mobile app ships | Later |

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Template rejection by Meta | Keep body generic ("your booking for {{2}}"), no marketing words like "offer/discount" in utility templates |
| Number flagged for spam (quality rating → messaging limits) | Opt-in only, transactional templates, honor STOP, per-user daily cap (e.g. 10/day enforced in drain) |
| Unverified/wrong phones | Only send to `phone_verified` numbers (OTP doc); dead-number receipts → auto opt-out after 3 failures |
| Token expiry | System User permanent token; monitor 401s in drain → alert |
| Cost creep | Routing table §5 limits WhatsApp to ~8 high-value types; monthly spend report in admin |

## 10. Acceptance checklist

- [ ] User opts in on profile → booking → WhatsApp template lands <60s
- [ ] User replies STOP → no further WhatsApp messages; in-app unaffected
- [ ] Drain cron retries a failed row with backoff; dies after 5 attempts
- [ ] Cancel event → every ticket holder gets in-app + WhatsApp
- [ ] No notification ever blocks/breaks checkout or cancel flows
- [ ] `/admin` shows outbox stats + last errors
