# Auth Rework: Google OAuth + Magic Link Email

Replace the current email+password login with two passwordless options:
1. **Google OAuth** — "Continue with Google" button using Supabase OAuth redirect flow
2. **Magic Link** — User enters email only, Supabase sends a sign-in link, clicking it logs them in

No passwords. No OTP codes. After auth (new or returning user), redirect straight to the homepage or the `next` path. Profile fields (name, phone, gender, interests) are collected later during booking/profile editing.

All existing functionality stays intact: profiles, organizer flow, admin, bookings, tickets, door scanning, etc.

---

## Implementation Steps

### 1. Rewrite `src/components/auth/login-panel.tsx`

Replace the entire `SupabaseLogin` component:

- **Remove**: email+password form, signin/signup toggle, password input
- **Add**: single email input + "Send magic link" button
- **Add**: "Continue with Google" button below a divider
- **Magic link flow**: `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` } })` → show "Check your email" success state
- **Google flow**: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` } })` → browser redirects to Google
- **Success state**: after sending magic link, show a confirmation message ("Check your email for a sign-in link") with a "Resend" option
- **Error handling**: display Supabase error messages (rate limit, invalid email, etc.)
- Keep the existing `INPUT` class and `Button` component for visual consistency

### 2. Update `src/app/auth/callback/route.ts`

The existing callback already exchanges the code for a session and redirects to `next`. This works for both Google OAuth and magic link callbacks. **No changes needed** — just verify it handles the `next` param correctly for both flows.

### 3. Update `src/app/login/page.tsx`

- Keep the existing structure (redirect if already logged in, render `LoginPanel`)
- Update the subtitle text to reflect passwordless auth: "Sign in with Google or your email — no password needed."
- Pass the `next` param to `LoginPanel` (already done)

### 4. Verify `handle_new_user()` trigger handles both flows

The existing trigger in `supabase/schema.sql` (line 779) already handles new users:
```sql
insert into public.profiles (id, full_name, phone, avatar_url)
values (
  new.id,
  coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
  new.phone,
  new.raw_user_meta_data ->> 'avatar_url'
)
on conflict (id) do nothing;
```

- **Google OAuth**: Supabase populates `raw_user_meta_data` with `full_name`, `avatar_url`, etc. — trigger works as-is.
- **Magic link**: `raw_user_meta_data` will be empty, so `full_name` and `avatar_url` will be NULL. Profile is created with defaults. User fills in name later via profile page. This is fine per the "straight to homepage" decision.

**No schema changes needed.**

### 5. Update `src/lib/auth.ts` — `getCurrentUser()`

The existing code already reads `user.user_metadata?.full_name` as a fallback for the name. For magic-link users, this will be empty, so it falls back to `"Outsider"`. This is acceptable — the profile page lets them set their name later.

**No changes needed**, but verify the fallback chain works:
```ts
name: profile?.full_name ?? user.user_metadata?.full_name ?? "Outsider",
```

### 6. Remove password-related code (cleanup)

- In `login-panel.tsx`: remove `password` state, `signInWithPassword` call, `signUp` call, password input, signin/signup toggle
- The commented-out phone OTP block can stay (it's already disabled)
- The commented-out Google OAuth block should be **removed** (we're implementing it for real now)

### 7. Supabase Dashboard configuration (manual — document in plan)

The following must be configured in the Supabase Dashboard (not code):

1. **Authentication → Providers → Email**:
   - Enable "Confirm email" (should be on by default)
   - Ensure "Enable signup" is on

2. **Authentication → Providers → Google**:
   - Enable Google provider
   - Add Client ID and Client Secret from Google Cloud Console
   - Configure authorized redirect URIs in Google Cloud Console:
     - `https://nlhwnoqgrnbyprksthfi.supabase.co/auth/v1/callback`

3. **Authentication → URL Configuration**:
   - Site URL: `https://outsiderr.in` (production)
   - Redirect URLs: add `http://localhost:3000/auth/callback`, `http://localhost:3001/auth/callback`, `https://outsiderr.vercel.app/auth/callback`, `https://outsiderr.in/auth/callback`

4. **Authentication → Email Templates**:
   - Customize the "Magic Link" template to say "Sign in to Outsiderr" with the `{{ .ConfirmationURL }}` link

### 8. Update `.env.example`

No new env vars needed — Supabase OAuth uses the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Google OAuth credentials are stored in Supabase Dashboard, not in the app env.

### 9. Verify no other code references passwords

Search for `signInWithPassword`, `signUp`, `password` across the codebase to ensure nothing else depends on the password flow. The `signOutAction` in `src/actions/auth.ts` is provider-agnostic and needs no changes.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/auth/login-panel.tsx` | **Rewrite**: Replace email+password form with magic-link email input + Google OAuth button |
| `src/app/login/page.tsx` | **Minor**: Update subtitle text to "Sign in with Google or your email — no password needed." |
| `src/app/auth/callback/route.ts` | **No changes** — already handles code exchange + redirect |
| `src/lib/auth.ts` | **No changes** — already handles user_metadata fallback |
| `src/actions/auth.ts` | **No changes** — signOut is provider-agnostic |
| `supabase/schema.sql` | **No changes** — handle_new_user trigger works for both flows |
| `supabase/migrations/fix_all.sql` | **No changes** — no schema changes needed |

## Files NOT Modified (out of scope)

- Profile page (`/profile`) — already lets users edit name/phone/gender/interests
- Organizer flow — uses `getCurrentUser()` which is provider-agnostic
- Admin flow — uses `getCurrentUser()` + `is_admin` flag
- Booking/checkout — uses `getCurrentUser()`
- Door scanning — uses `getCurrentUser()`
- All server actions — use `getCurrentUser()` which is provider-agnostic

---

## Verification

- [ ] `npx next build` passes with zero type errors
- [ ] Login page shows: email input + "Send magic link" button + "Continue with Google" button
- [ ] No password field visible
- [ ] No signin/signup toggle (magic link is both signin and signup — Supabase creates the user if they don't exist)
- [ ] Google button redirects to Google consent → back to `/auth/callback` → to `next` path
- [ ] Magic link sends email → clicking link → back to `/auth/callback` → to `next` path
- [ ] New user (Google or magic link) lands on homepage with a profile row created by the trigger
- [ ] Existing logged-in user visiting `/login` is redirected to `next`
- [ ] Sign out still works (UserMenu → Sign out)
- [ ] Organizer creation still works after auth
- [ ] Event creation still works after auth
- [ ] Booking flow still works after auth

## Risks / Considerations

1. **Google OAuth requires Supabase Dashboard setup** — The Google provider must be enabled in Supabase with valid Client ID/Secret from Google Cloud Console. This is a manual step outside the codebase. Without it, the Google button will fail with a provider error.

2. **Magic link rate limiting** — Supabase limits magic link emails (default: 4 per hour per email). The UI should show a "Resend" button but with a cooldown indicator to prevent spamming.

3. **Existing users with passwords** — Users who signed up with email+password previously can still sign in with magic link (Supabase allows both). Their password remains but is unused. No migration needed.

4. **Email deliverability** — Magic links depend on Supabase's email service. For production, consider configuring a custom SMTP server in Supabase Dashboard for better deliverability. The default Supabase email has strict rate limits.

5. **`auto_promote_first_admin` trigger** — Still fires on profile insert. The first user to sign up (via Google or magic link) after a `wipe_all.sql` will become admin. This is the existing behavior and is intentional.

6. **Mobile UX** — Google OAuth redirect flow works well on mobile browsers. Magic link requires switching to the email app and back, which is standard behavior.
