# 5-Day Full-App Test Plan

**Goal:** cover every user-facing flow + money path before go-live. Test each day, send findings nightly, fixes land overnight. Day 5 closes with a regression sweep over whatever broke earlier in the week.

**How to report findings** - copy this per issue and send at the end of each day:

```
Day N · [page/URL] · severity (blocker / major / minor)
What I did:
What happened:
What should happen:
Screenshot? yes/no
```

**Accounts you’ll need:**

*   1 admin (first signup after the wipe auto-becomes admin)
*   **2 creator accounts** - Creator A and Creator B (needed for collaborator tests)
*   3+ plain users - User 1 buys tickets/joins communities, User 2 becomes a promoter, User 3 tests fresh-state edge cases
*   1 second promoter if you want to compare attribution between two promoters

Cross-reference `docs/reference/test-scenarios.md` for deep scenario detail per section.

 *

## Day 1 - Discovery, auth, profile, creator onboarding

**Focus: can a brand-new user get in and orient?**

- [ ] Homepage loads; event grid renders (desktop + mobile)
- [ ] City switcher filters events + communities correctly
- [ ] Category/subcategory chips filter; no stale states
- [ ] Event card → detail page; poster, price, venue, date all correct
- [ ] Organizer public page `/organizers/[id]` - bio, events, follow button
- [ ] Signup (email + Google), login, logout - all work; redirects back to the page you were on
- [ ] Rate limit on repeated login/OTP attempts
- [ ] `/profile` - edit name/avatar/bio/phone; interested-in categories drive the tag list (no giant wall of tags)
- [ ] Profile → Communities section shows joined communities; Following section lists followed organizers
- [ ] Member public profile `/members/[id]` renders
- [ ] `/badges` - ladder shows earned vs locked with requirements
- [ ] Become a Creator (`/list-your-event`) - hero, orbit, three CTAs (Communities / Start Creating / Events)
- [ ] Creator wizard: name + terms required; PAN / GST / bank all skippable via “Skip - Add Later”
- [ ] When PAN filled: card photo required before Continue; Bank step needs UPI+acct+IFSC+name+proof OR skip
- [ ] Abandon onboarding mid-upload → uploaded media is cleaned up
- [ ] Submit bare application → dashboard opens, NO admin KYC notification
- [ ] Fill PAN+bank+GST later via Edit profile → goes to admin review (PENDING)
- [ ] Dashboard shows “Add your bank account” notice until bank details exist; clicking it opens Edit profile
- [ ] “Become a Creator” menu item flips to “Creator Dashboard” for the creator account
- [ ] Repeat for **Creator B** - both accounts must exist end of Day 1

## Day 2 - Creator: events, communities, collaborators

**Focus: the full organizer toolkit.**

**Events**

- [ ] Create event end-to-end: title/dates/venue(TBA + real)/tiers/pricing/categories/multi-category/tags/photos
- [ ] Save draft → publish later via Publish button AND via edit → publish
- [ ] Edit event: every section saves independently; banner/poster/teaser upload
- [ ] Attach event to a community, change community, detach to public - all three paths
- [ ] Visibility: Open / Members-only / Invite-only - invite link works, broken link rejected
- [ ] Recurring (weekly) community event creates repeats; linked past events work
- [ ] Waitlist toggle + “update me” subscription + max tickets per user
- [ ] Things-to-know bullets, contact info, terms acceptance on publish
- [ ] Cancel/postpone buttons notify ticket holders

**Communities**

- [ ] Create community: name, category, **multiple subcategories**, prefilled terms (edit them), socials
- [ ] Community page: cover (16:9 + 3:4 mobile), avatar not clipped, join button (NO follow button)
- [ ] Community cap: creating community #11 fails (or your admin-set cap+1)
- [ ] Manage community: Members / Requests / Import / Events / Analytics tabs
- [ ] Member count toggle → public page shows/hides “N members”
- [ ] Events tab lists community events w/ views, sold, check-ins, net payout
- [ ] Analytics tab: stats + “Interested, not converted” (paginate, Export CSV, per-row Notify, Notify all)
- [ ] Join questions (private community) - request → approve → member list
- [ ] **Invite-only community**: invite link joins directly
- [ ] Member removal + re-join behavior
- [ ] CSV member import: upload, invalid-row surfacing, admin approve, members appear

**Collaborators (needs Creator A + B)**

- [ ] Creator A invites Creator B as collaborator on an event
- [ ] Creator B sees invite (notification + `/organizer` panel), accepts → gets access
- [ ] Creator B (LIMITED): sees operational analytics, CANNOT see money, CANNOT edit community attach, CANNOT cancel
- [ ] Declined invite → no access; removed collaborator → access gone
- [ ] Staff members: add door staff + box office staff (name+phone or email), they can sign in
- [ ] Box office PIN + scanner PIN generation + revoke
- [ ] Door-staff paid order: request N staff → service fee recorded
- [ ] Guestlist link creation + guest claims free ticket

## Day 3 - Money: bookings, refunds, payouts, promoters

**Focus: every rupee in and out. Keep a calculator handy.**

- [ ] Free event: book → ticket issued instantly
- [ ] Paid event: Razorpay checkout success → confirmed order + ticket + notification
- [ ] Payment failure/abandoned → order states correct, reservation expires, stock returns
- [ ] Convenience fee math: buyer pays ticket + fee; organizer gets subtotal − commission; verify paise-exact
- [ ] ORGANIZER-pays-fees event: buyer pays just subtotal, payout shrinks correctly
- [ ] Phased pricing: early-bird vs later tier charges correct prices at phase boundaries
- [ ] Multi-ticket order: qty × price correct; max tickets per order enforced
- [ ] `/tickets` - QR visible, print ticket page works
- [ ] Cancel event → refund choices work; postpone → notified; money math on each
- [ ] Refund queue → Razorpay refund initiates; manual settle path; refund failure retry
- [ ] Organizer Ledger (`/organizer/payments`): every txn listed, net payout column correct
- [ ] Admin → Money → Organizer Payouts: create payout, mark complete w/ UTR; payout failure + failure\_reason recorded; ledger updates
- [ ] Admin → Money → Revenue/Payments/Refunds tabs all render with correct math
- [ ] **Promoter (User 2)**: `/promoter` dashboard, create link for an event
- [ ] Promoter link click → User 1 books → commission accrues on organizer’s tab; click tracked
- [ ] Promo-code mode: buyer discount % off + promoter share %, both math-checked
- [ ] Promoter payout: below min → blocked; at min → 2% processing fee deducted; snapshot shows gross + fee + bank
- [ ] Duplicate-click protection: same user buying twice via same link only counts once

**Creator referral program** (Promoter 2 → Creator B):
- [ ] `/promoter` → "Refer creators" card shows a `/r/<slug>` link with expiry date + click count
- [ ] Copy link → open incognito → lands on `/list-your-event`; click is counted on the promoter dashboard
- [ ] Creator B signs up via that link → creator wizard completes → promoter dashboard lists "Creator B" under onboarded organizers (0/5 events)
- [ ] Creator B publishes a **free** event → organizer still shows 0/5 (free events never consume the window)
- [ ] Creator B publishes a **paid** event → "1/5 events counted"
- [ ] User 1 buys on that paid event → promoter earning row appears labelled "Creator referral", amount = 10% of the order's platform commission (math-check: subtotal × commission_bps × 10%)
- [ ] Publish + sell on events 2-5 → each earns; event 6 → sells fine but earns ₹0 for the referrer
- [ ] Creator B's payout is unaffected - referral cost does NOT come out of their money
- [ ] Refund that order → referral earning claws back (row shows reversal)
- [ ] Admin → Settings → Charges: change "Creator-referral event limit" to 1 → next referred organizer only earns on 1 event; change share to 5% → earning math follows
- [ ] Link expiry: temporarily set link TTL to 0 days / wait for expiry → old link stops attributing, promoter regenerates a fresh slug
- [ ] Self-referral: promoter's own organizer signup via own link → not attributed
- [ ] Admin → Money top strip: "Referral cost (ours)" tile reflects the referral earnings; `/admin/promoters` shows Creator B under the promoter's onboarded list
- [ ] Guestlist ticket is ₹0 - no payment required
- [ ] Box office sale: cash/UPI sale records correctly; refund on a box-office order
- [ ] Second promoter attribution - commissions don’t bleed between promoters

## Day 4 - Admin console + notifications + door ops

**Focus: every admin surface.**

- [ ] `/admin` overview tiles load
- [ ] Events tab: list + per-event **Analytics** link → detail page (orders, money split, views, warm count, tiers, sales/day); feature/cancel buttons
- [ ] Money hub: all 5 tabs (Revenue/Payments/Refunds/Organizer Payouts/Promoter Payouts); refunds filter (queue/all/completed) works
- [ ] KYC review: approve/reject/clarify - creator notified; clarify thread messages both ways
- [ ] Boosts: feature + slot requests, approve/reject; slot prices editable; invoice view
- [ ] Hero boosts on homepage show boosted event first
- [ ] Campaigns tab on organizer side mirrors admin approvals
- [ ] Box Office hub: Orders / Staff / PINs tabs all work
- [ ] Compliance & Legal hub: tasks (add/complete, auto-signals appear) + legal page editor (version history, live switch, saved-by email)
- [ ] Communities admin: pending approve/reject + live stats line per community
- [ ] Community imports: review imported member batches
- [ ] Users/organizers lists render; organizer detail shows KYC + events
- [ ] Settings: every field saves - esp. `promoter_payout_fee_bps`, `community_max_per_organizer`, commission tiers, convenience fee, gateway, taglines, hero/slot config, premium prices
- [ ] Notifications: bell updates realtime (no refresh) - community notifications have View + Join inline; mark read/mark all read/clear/load more
- [ ] Community event created/published/attached → all ACCEPTED members notified (one notif per member, owner excluded)
- [ ] Scanner: PIN login, QR scan, check-in marks USED, duplicate scan rejected, offline-safe behavior
- [ ] Box office: PIN login, sell ticket, door list shows arrivals
- [ ] Admin analytics: date filter rescopes every series; city filter scopes event-attributed stats; growth funnel (visitors→views→shares→signups→conversion); CSV export

## Day 5 - Edges, regression, mobile

**Focus: break it.**

- [ ] Regression: rerun anything that failed Days 1-4
- [ ] Invite-only community event: no invite → blocked; valid invite → allowed
- [ ] Members-only event: non-member → blocked; member → allowed
- [ ] Ticket stock: buy last ticket → sold out state; rapid double-click on buy → no oversell; two users racing the last seat → exactly one wins
- [ ] Reservation TTL: let a RESERVED order expire → stock returns
- [ ] Refund deadline/cancellation window respected
- [ ] Waitlist: sold-out → join waitlist → ticket frees → backfill offer → accept converts
- [ ] Empty states everywhere: no events, no communities, no members, no tickets, no leads, no badges
- [ ] Badges: after 1/3/5/10/15 attendances → correct tier unlocks; founding member (joined in first 30d); connector (3+ referral joins)
- [ ] Event reviews: post after attending; display on event page
- [ ] Community referral: member shares invite link with ref code → join credited
- [ ] Virality: share button logs; analytics shows referred vs organic
- [ ] Mobile: homepage, event detail, create form, manage pages, admin, scanner - no overflow/clipped chips
- [ ] Legal pages render live versions at `/legal/[slug]`; version switch works; footer links resolve
- [ ] Community card on /communities: avatar + subcategory chip NOT clipped
- [ ] Sign out/in flows; session persistence across reload
- [ ] Direct URL access: non-owner hits `/organizer/events/[id]` → blocked; collaborator gets LIMITED view; non-admin hits `/admin` → blocked; non-creator hits `/organizer` → gate screen
- [ ] **Logged-out access**: every protected route shows the login gate (never an error page) - `/admin`, `/admin/money`, `/organizer`, `/organizer/events/[id]`, `/tickets`, `/profile`, `/promoter`, `/box-office`, `/scan`
- [ ] **Invisible events**: draft event URL → 404 publicly (visible to owner only); cancelled event → correct state; random fake UUID → 404
- [ ] **Dead referral links**: `/p/badslug` → clean redirect to `/` (no error); `/r/badslug` + expired `/r/` link → lands on `/list-your-event` with no attribution
- [ ] Organizer premium purchase (if enabled): premium price from settings, expiry respected
- [ ] Share/copy-link buttons on event + community pages
- [ ] Offline: kill network → themed offline page + snake game shows

 *

**Daily rhythm:** test during the day → send findings by evening → I fix overnight → next morning verify + move on. Monday = deploy prep.