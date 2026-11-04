# Phone OTP Authentication — Solution + Design Doc

Add phone-number OTP sign-in alongside the existing Google OAuth + magic
link. India-first audience — many users prefer phone over email.

Last updated: 2025 — status: **proposal**.

Related: `docs/reference/auth-rework-plan.md` (current passwordless setup),
`docs/reference/notifications-solution.md` (WhatsApp infra — the OTP channel
shares it in Phase B).

---

## 1. Goals

1. Sign in with **phone + 6-digit OTP** — no password.
2. Works alongside existing methods (Google, magic link). Same account
   regardless of entry point when the user links them.
3. Verified phone is reusable: WhatsApp notifications, order-contact
   prefill, door-staff linking.
4. Abuse-resistant: rate limits, resend cooldown, attempt caps, no user
   enumeration.

## 2. Options

| Option | How | Cost (India) | Effort | Verdict |
|---|---|---|---|---|
| **A. Supabase native SMS OTP** (Twilio / Vonage / MessageBird / Textlocal) | `signInWithOtp({ phone })` + `verifyOtp()` — built into Supabase Auth | Twilio ~₹3–4/SMS; Textlocal/MSG91-class ~₹0.20–0.40 | **Small** — mostly config + UI | ✅ **Phase A** — ship this first |
| **B. WhatsApp OTP** (Meta authentication template) | Custom: own `otp_challenges` table → send via Cloud API → verify → `admin.generateLink` session | ~₹0.115/msg | **Medium** — needs custom verify + session minting | ✅ **Phase B** — once WhatsApp notifications land (same infra, ⅓ the cost of SMS) |
| C. Third-party OTP service (MSG91 widget, Firebase) | Vendor SDK | ~₹0.20 | Medium + vendor lock | Backup if Supabase SMS deliverability is poor in India |

**Recommended path: A now, B when the WhatsApp stack exists.** Phase A needs
almost no custom code (Supabase does OTP generation, hashing, expiry,
attempt limits). Phase B then becomes an *additional delivery channel* for
the same UX, not a rewrite.

## 3. High-Level Design

```
 LoginPanel (client)
   ┌─────────────┬──────────────┬────────────────┐
   │ Google btn  │ Email + link │ Phone + OTP    │
   └──────┬──────┴──────┬───────┴───────┬────────┘
          │             │               │
          ▼             ▼               ▼
   Supabase OAuth  signInWithOtp   Phase A: signInWithOtp({phone})
   /auth/callback  ({email})        Phase B: /api/auth/otp/send
          │             │               │
          └─────────────┴───────────────┤
                                       ▼
                              Supabase Auth session
                                       │
                              handle_new_user trigger → profiles row
                              (phone already populated for phone signups)
```

Session handling is identical for all three — Supabase session cookie,
`getCurrentUser()` unchanged, `next` redirect via the `auth_next` cookie
(already implemented for OAuth/magic link).

## 4. Phase A — SMS OTP via Supabase (LLD)

### 4.1 Supabase dashboard config (no code)

1. **Authentication → Providers → Phone**: enable.
2. Pick SMS provider — **Twilio Verify** (reliable India DLT routes) or
   **Textlocal** (India-based, cheaper). Enter SID/token/sender.
3. **OTP length 6, expiry 3600s** (default), enable "Confirm phone".
4. **Rate limits**: Authentication → Rate Limits → SMS: ~5/hour/IP.
5. **Test numbers**: add `+91 9999999999 → OTP 123456` for staging/QA —
   free, unlimited.
6. Templates (India DLT): keep the default "`Your Outsiderr code is
   {{ .Code }}`" — short transactional strings pass DLT scrubbing.

### 4.2 Login UI — `shared/ui/auth/login-panel.tsx`

Add a method switcher (Email | Phone) above the existing form:

```tsx
const [method, setMethod] = useState<"email" | "phone">("email");
const [phone, setPhone] = useState("");
const [otpSent, setOtpSent] = useState(false);
const [code, setCode] = useState("");

// E.164 — normalisePhone() gives last-10 digits; India-only launch → +91
const e164 = `+91${normalisePhone(phone)}`;

async function sendPhoneOtp() {
  setPending(true); setError(null);
  const { error } = await createClient().auth.signInWithOtp({ phone: e164 });
  setPending(false);
  if (error) return setError(friendlyOtpError(error));
  setOtpSent(true);
}

async function verifyPhoneOtp() {
  setPending(true); setError(null);
  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: e164, token: code.trim(), type: "sms",
  });
  if (error) { setPending(false); return setError("Incorrect or expired code."); }
  router.replace(next);          // session cookie already set by verifyOtp
  router.refresh();
}
```

OTP input: one 6-box auto-advancing input (or single input with
`inputMode="numeric" maxLength={6} autoComplete="one-time-code"` —
`one-time-code` gives iOS/Android autofill-from-SMS for free).

Resend: button enabled after 30s countdown; max 5 sends/session (client-side
counter + Supabase rate limit as backstop).

### 4.3 `handle_new_user` — already compatible

The trigger (schema.sql ~L1347) copies `new.phone` into `profiles.phone`.
Phone-auth signups land with phone populated and `phone_verified` marked by
Supabase itself (`auth.users.phone_confirmed_at`).

### 4.4 Schema additions

```sql
alter table public.profiles
  add column if not exists phone_verified boolean not null default false;

-- Backfill: anyone who signed in via phone already proved ownership.
update public.profiles p
   set phone_verified = true
  from auth.users u
 where u.id = p.id and u.phone_confirmed_at is not null;

-- Keep it in sync going forward (trigger on profile update is not enough —
-- verification lives on auth.users; refresh on each login via
-- getCurrentUser() or a periodic reconcile).
```

Also add a **unique index on `profiles.phone`** where not null — required
for phone-based lookups (staff linking, WhatsApp delivery):

```sql
create unique index if not exists profiles_phone_key
  on public.profiles(phone) where phone is not null;
```

### 4.5 Account linking (the hard edge case)

Same human, two identifiers → Supabase creates **two `auth.users` rows** if
they sign up once via Google and once via phone. Supabase has
`linkIdentity()` for merging, but it requires an *existing* session:

```ts
// While signed in (any method), on the Profile page:
await supabase.auth.linkIdentity({ provider: "phone" });  // concept; phone
// linking is done via updateUser({ phone }) → OTP verify → confirms on same uid
await supabase.auth.updateUser({ phone: e164 });          // sends OTP to the
                                                         // phone, verifies → attaches to current account
```

So the real design:

- **Profile page**: "Verify phone number" section → `updateUser({ phone })`
  → OTP → phone attached to the *current* account. This is the preferred
  linking path — no merges needed.
- **Phone-first signup** → later adds Google/email via the same
  `updateUser({ email })` flow.
- **Collision**: `updateUser` with a phone that belongs to another account
  fails — surface "This number is linked to another account. Sign in with
  your phone instead."
- Document that we do **not** auto-merge accounts — too risky (orders,
  tickets, payouts split across uids).

## 5. Phase B — WhatsApp OTP (LLD, after notifications P1–P2 land)

Same UX, different pipe. Meta **authentication templates** are purpose-built
for OTP (copy-code button in WhatsApp, ~₹0.115/msg — cheaper than SMS).

```sql
create table if not exists public.otp_challenges (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,              -- E.164
  code_hash   text not null,              -- sha256(code + salt) — never store plaintext
  attempts    smallint not null default 0,
  expires_at  timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.otp_challenges (phone, created_at desc);
-- service_role only
```

Two routes (Node runtime, service client):

- `POST /api/auth/otp/send { phone }` → rate-limit (5/hour/phone+IP), mint
  6-digit code, store hash, send via `sendWhatsAppTemplate(phone,
  "otp_auth_v1", [code])` — authentication template with copy-code button.
- `POST /api/auth/otp/verify { phone, code }` → check hash, attempts <5,
  not expired/consumed → mint a session:
  `supabase.auth.admin.generateLink({ type: "magiclink", email })` — wait,
  there's no email for phone-only users. Instead:
  `admin.createUser({ phone, phone_confirm: true })` if new → then
  `admin.generateLink({ type: "recovery", … })` is email-only too.
  **Cleanest:** keep using Supabase phone auth — `admin.updateUserById` won't
  mint a client session. Real option: `signInWithOtp` triggers Supabase's own
  SMS send; to bypass it use **Supabase Custom SMS Hook** (Send SMS hook →
  point to our WhatsApp sender). That's the correct integration:
  **Supabase Auth → Hooks → "Send SMS" → HTTPS endpoint → we forward the
  `{{ .Code }}` to WhatsApp instead of SMS.** Zero custom session code —
  verify stays `verifyOtp({type:"sms"})`, all of Phase A's UX/security
  applies, and Meta's auth-template pricing applies per message.

So Phase B = one HTTPS hook endpoint + template approval. Keep the table
design above only as a fallback if the hook isn't available on our plan.

## 6. Security checklist

| Control | Where |
|---|---|
| Rate limit sends: 5/hour per phone, 10/hour per IP | Supabase Auth rate limits + `rateLimit()` on custom routes |
| OTP attempts: max 5 per challenge | Supabase built-in (Phase A); `attempts` col (Phase B) |
| Resend cooldown: 30s | Client countdown + server rate limit backstop |
| No user enumeration | Same response "Code sent" whether or not the number exists |
| OTP TTL: 10 min | Supabase config |
| Test numbers only in non-prod | Supabase test-number config |
| Phone uniqueness enforced | `profiles_phone_key` unique index |
| Number verified before use | WhatsApp notifications + staff lookup gate on `phone_verified` / `phone_confirmed_at` |
| Session cookies | Unchanged — httpOnly Supabase session |

## 7. UX details

- Method switcher persists choice in localStorage (`outsiderr-login-method`).
- Phone field reuses `PhoneInput`; show `+91` prefix (India-only at launch;
  add country dropdown when expanding).
- Error copy: rate-limited → "Too many attempts. Try again in a few
  minutes."; wrong code → "That code didn't match. Request a new one."
- After phone verify on a *new* account → straight to `next` (same as
  Google), name collected later at booking/profile.
- `getCurrentUser()` — no changes; it reads auth session, not method.

## 8. Rollout

| Step | Scope |
|---|---|
| A1 | Supabase phone provider + SMS vendor + DLT template |
| A2 | LoginPanel method tabs + OTP UI + resend/cooldown |
| A3 | `phone_verified` column + unique index + backfill |
| A4 | Profile "verify phone" (`updateUser`) linking flow |
| A5 | Test number on staging; QA: signup, relogin, collision, rate limit |
| B1 | WhatsApp Business API live (notifications P1) + `otp_auth_v1` template |
| B2 | Supabase "Send SMS" hook → WhatsApp forwarder |
| B3 | Fallback: SMS channel stays live if WhatsApp send fails (hook returns error → Supabase falls back? No — hook failure fails the send; implement retry in the hook itself, fall back to SMS inside the hook) |

## 9. Acceptance checklist

- [ ] New user signs in with phone → lands on `next`, profile row has
      phone + `phone_verified=true`
- [ ] Returning user gets in by OTP; session same as Google sign-in
- [ ] `updateUser({phone})` on an existing Google account attaches the
      number after OTP
- [ ] Phone colliding with another account → clear error, no merge
- [ ] 6th wrong attempt → challenge dead; resend blocked by cooldown
- [ ] Test number signs in on staging without spending SMS credit
- [ ] WhatsApp-delivered OTP (Phase B) verifies through the same UI
