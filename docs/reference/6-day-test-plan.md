# 6-Day Full-App Test Plan

**Goal:** cover every user-facing flow + every admin feature + every money path before go-live. Test each day, send findings nightly, fixes land overnight. Day 6 closes with a regression sweep over whatever broke earlier in the week.

**Why this order:** the sequence mirrors the real product lifecycle - accounts exist before content, content exists before discovery is testable, bookings exist before money is testable, and everything exists before the admin audit. You can’t test a city filter before there are events in different cities.

**How to report findings** - copy this per issue and send at the end of each day:

```
Day N · [page/URL] · severity (blocker / major / minor)
What I did:
What happened:
What should happen:
Screenshot? yes/no
```

**Accounts to create on Day 1:**

*   1 admin (first signup after the wipe auto-becomes admin)
*   **2 creator accounts** - Creator A and Creator B (collaborator + referral tests need both)
*   3+ plain users - User 1 buys tickets/joins communities, User 2 becomes a promoter, User 3 tests fresh-state edge cases
*   Optional: 1 second promoter to compare attribution between two promoters

Cross-reference `docs/reference/test-scenarios.md` for deep scenario detail per section.

 *

## Day 1 - Accounts: auth, profiles, creator onboarding

**Focus: get every role provisioned. Nothing else is testable until this is done.**

**Auth + profile (all accounts)**

- [x] Signup (email + Google), login, logout - all work; redirect lands back on the page you were on
- [ ] Rate limit on repeated login/OTP attempts
- [ ] `/profile` - edit name/avatar/bio/phone; interested-in categories drive the tag list (no giant wall of tags)
- [ ] `/badges` - ladder shows earned vs locked with requirements

**Admin account**

- [x] First signup is auto-admin → `/admin` opens and overview tiles load
- [x] Logged-out `/admin` shows the login gate (never an error page)

**Creator onboarding (Creator A, then repeat for Creator B)**

- [ ] `/list-your-event` - hero, orbit, three CTAs (Communities / Start Creating / Events)
- [ ] Creator wizard: name + terms required; PAN / GST / bank / UPI all skippable via “Skip - Add Later”
- [ ] When PAN filled: card photo required before Continue; bank step needs acct+IFSC+name+proof OR skip
- [ ] Abandon onboarding mid-upload → uploaded media is cleaned up
- [ ] Submit bare application → dashboard opens, NO admin KYC notification
- [ ] Fill PAN+bank+GST later via Edit profile → goes to admin review (PENDING)
- [ ] Dashboard shows “Add your bank account” notice until bank details exist; clicking it opens Edit profile
- [ ] “Become a Creator” menu item flips to “Creator Dashboard” for creator accounts

**Exit criteria:** admin + Creator A + Creator B + User 1/2/3 all exist and can log in.

 *

## Day 2 - Content: events in every city, communities, collaborators

**Focus: build the content that Days 3-6 will test against.**

**Events (Creator A - spread across cities on purpose)**

- [ ] Create a PAID event in City 1 (Mumbai): title/dates/venue (TBA + real)/tiers/phased pricing/categories/multi-category/tags/photos
- [ ] Create a FREE event in City 2 (Delhi)
- [ ] Create a second PAID event in City 3 (Bengaluru) - needed for the referral window test
- [ ] Create a DRAFT event (unpublished) - confirm it’s invisible to the public
- [ ] Save draft → publish later via Publish button AND via edit → publish
- [ ] Edit event: every section saves independently; banner/poster/teaser upload
- [ ] Visibility: Open / Members-only / Invite-only - invite link works, broken link rejected
- [ ] Recurring (weekly) community event creates repeats; linked past events work
- [ ] Waitlist toggle + “update me” subscription + max tickets per user
- [ ] Things-to-know bullets, contact info, terms acceptance on publish
- [ ] Cancel/postpone buttons notify ticket holders (verify on one event)

**Communities (Creator A + one for Creator B)**

- [ ] Create community: name, category, **multiple subcategories**, prefilled terms (edit them), socials
- [ ] Community page: cover (16:9 + 3:4 mobile), avatar not clipped, Join button (NO Follow button)
- [ ] Attach a published event to a community, change community, detach to public - all three paths
- [ ] Member count toggle → public page shows/hides “N members”
- [ ] Join questions (private community) - request → approve → member list
- [ ] **Invite-only community**: invite link joins directly
- [ ] CSV member import: upload, invalid-row surfacing, members appear (admin approval is Day 5)
- [ ] Community cap: creating community #11 fails (or your admin-set cap+1)

**Collaborators (Creator A + B)**

- [ ] Creator A invites Creator B as collaborator on an event
- [ ] Creator B sees invite (notification + `/organizer` panel), accepts → gets access
- [ ] Creator B (LIMITED): sees ops analytics, CANNOT see money, CANNOT edit community attach, CANNOT cancel
- [ ] Declined invite → no access; removed collaborator → access gone
- [ ] Staff members: add door staff + box office staff (name+phone or email), they can sign in
- [ ] Box office PIN + scanner PIN generation + revoke
- [ ] Door-staff paid order: request N staff → service fee recorded
- [ ] Guestlist link creation + guest claims free ticket

**Exit criteria:** paid + free + draft events exist across 2-3 cities; communities exist with members; collaborator access verified.

 *

## Day 3 - Discovery as a user: browse, filter, join, book

**Focus: everything a regular user sees - NOW there is real content to find.**

- [ ] Homepage loads; event grid renders (desktop + mobile)
- [ ] **City filter**: select City 1 → only that city’s events; City 2 → different results; **All Cities** → everything (this is only testable now that events exist in multiple cities)
- [ ] City indicator shows the selected city on homepage AND on `/communities`
- [ ] `/communities`: city filter scopes communities; All Cities shows all
- [ ] Category/subcategory chips filter; no stale states
- [ ] Event card → detail page; poster, price, venue, date all correct
- [ ] Organizer public page `/organizers/[id]` - bio, events, follow button
- [ ] Community page: Join works → member appears; auto-subscribed to that community’s events
- [ ] Profile → Communities section shows the joined community; Following section lists followed organizers
- [ ] Member public profile `/members/[id]` renders - click a member from the community Members list
- [ ] Member removal + re-join behavior
- [ ] Free event: book → ticket issued instantly
- [ ] Paid event: Razorpay checkout success → confirmed order + ticket + notification
- [ ] `/tickets` - QR visible, print ticket page works
- [ ] Community event created/published/attached → all ACCEPTED members notified (one notif per member, owner excluded)
- [ ] Notification bell: realtime update (no refresh); community notifs have View + Join inline; mark read/all read/clear/load more

**Exit criteria:** User 1 has tickets (free + paid) and community memberships; notifications verified.

 *

## Day 4 - Money + promoters + door ops

**Focus: every rupee in and out. Keep a calculator handy.**

**Booking math**

- [ ] Convenience fee math: buyer pays ticket + fee; organizer gets subtotal − commission; verify paise-exact
- [ ] ORGANIZER-pays-fees event: buyer pays just subtotal, payout shrinks correctly
- [ ] Phased pricing: early-bird vs later tier charges correct prices at phase boundaries
- [ ] Multi-ticket order: qty × price correct; max tickets per order enforced
- [ ] Payment failure/abandoned → order states correct, reservation expires, stock returns

**Refunds + payouts**

- [ ] Cancel event → refund choices work; postpone → notified; money math on each
- [ ] Refund queue → Razorpay refund initiates; manual settle path; refund failure retry
- [ ] Organizer Ledger (`/organizer/payments`): every txn listed, net payout column correct
- [ ] Box office sale: cash/UPI sale records correctly; refund on a box-office order
- [ ] Guestlist ticket is ₹0 - no payment required

**Promoter - event promotion (User 2)**

- [ ] `/promoter` dashboard, create link for an event (`/p/<slug>`)
- [ ] Promoter link click → User 1 books → commission accrues on organizer’s tab; click tracked
- [ ] Promo-code mode: buyer discount % off + promoter share %, both math-checked
- [ ] Promoter payout: below min → blocked; at min → 2% processing fee deducted; snapshot shows gross + fee + bank
- [ ] Duplicate-click protection: same user buying twice via same link only counts once
- [ ] Second promoter attribution - commissions don’t bleed between promoters

**Creator referral program (Promoter → Creator B)**

- [ ] `/promoter` → “Refer creators” card shows a `/r/<slug>` link with expiry date + click count
- [ ] Copy link → open incognito → lands on `/list-your-event`; click counted on the promoter dashboard
- [ ] A NEW creator (Creator C) signs up via that link → wizard completes → promoter dashboard lists them under onboarded organizers (0/5 events)
- [ ] Creator C publishes a **free** event → still 0/5 (free events never consume the window)
- [ ] Creator C publishes a **paid** event → “1/5 events counted”
- [ ] User 1 buys on that paid event → promoter earning labelled “Creator referral”, amount = 10% of the order’s platform commission (math-check: commission × 10%)
- [ ] Publish + sell on events 2-5 → each earns; event 6 → sells fine but earns ₹0 for the referrer
- [ ] Creator C’s payout is unaffected - referral cost does NOT come out of their money
- [ ] Refund that order → referral earning claws back (row shows reversal)
- [ ] Self-referral: promoter’s own organizer signup via own link → not attributed
- [ ] Link expiry: set link TTL low → old link stops attributing; promoter regenerates a fresh slug

**Door ops hands-on**

- [ ] Scanner: PIN login, QR scan, check-in marks USED, duplicate scan rejected, offline-safe behavior
- [ ] Box office: PIN login, sell ticket, door list shows arrivals

**Exit criteria:** money math verified on real orders; refunds + payouts flow; both promoter income types verified; scanner + box office work.

 *

## Day 5 - Admin console: every tab, every feature

**Focus: dedicated admin day - go tab by tab, leave nothing unclicked. Check tab-switch loading spinners everywhere.**

**Top strip + hubs**

- [ ] `/admin` overview tiles + date/city filters rescope stats
- [ ] **Money hub** top strip: collected / refunded / platform keeps / organizers paid+owed / promoters paid+earned / referral cost - all tiles show numbers consistent with Day 4 activity
- [ ] Money → Revenue / Payments / Refunds / Organizer Payouts / Promoter Payouts: every tab loads, math correct
- [ ] Organizer Payouts: create payout, mark complete w/ UTR; payout failure + failure\_reason recorded; ledger updates
- [ ] Refunds filter (queue/all/completed) works
- [ ] **Box Office hub**: Orders / Staff / PINs tabs all work
- [ ] **Compliance hub**: tasks (add/complete, auto-signals appear) + legal page editor (version history, live switch, saved-by email)

**Events, communities, people**

- [ ] Events tab: list + per-event **Analytics** link → detail page (orders, money split, views, warm count, tiers, sales/day); feature/unfeature; cancel
- [ ] Communities admin: pending approve/reject + live stats line per community (members, +30d, events, attendees, views)
- [ ] Community imports: review + approve the Day 2 import batch → members appear
- [ ] Users/organizers lists render; organizer detail shows KYC + events
- [ ] **Promoters**: table shows earned/payable/paid + “Creators onboarded” column; Creator Referrals section maps promoter → organizer with window usage; payout actions work
- [ ] KYC review: approve/reject/clarify - creator notified; clarify thread messages both ways

**Growth surfaces**

- [ ] Boosts: feature + slot requests, approve/reject; slot prices editable; invoice view
- [ ] Hero boosts on homepage show boosted event first
- [ ] Campaigns tab mirrors admin approvals
- [ ] Admin analytics: date filter rescopes every series; city filter scopes event-attributed stats; growth funnel (visitors→views→shares→signups→conversion); CSV export

**Settings - click every field**

- [ ] Every setting saves: `promoter_payout_fee_bps`, `community_max_per_organizer`, commission tiers, convenience fee, gateway, taglines, hero/slot config, premium prices
- [ ] **Referral settings**: `promoter_org_share_bps` (10%), `promoter_org_event_limit` (5), `promoter_org_link_ttl_days` (30), `promoter_org_attribution_days` (30) - change event limit to 1 → next referred organizer only earns on 1 event; change share to 5% → earning math follows
- [ ] Toggle switches (hero boost, premium gate) render aligned + save
- [ ] Access check: non-admin user hitting `/admin/*` is blocked (error state, no data)

**Exit criteria:** every admin tab opened, every setting saved once, money strip numbers reconcile with Day 4 activity.

 *

## Day 6 - Edges, regression, mobile, launch checklist

**Focus: break it.**

- [ ] Regression: rerun anything that failed Days 1-5
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
- [ ] **Logged-out access**: every protected route shows the login gate (never an error page) - `/admin`, `/admin/money`, `/organizer`, `/organizer/events/[id]`, `/tickets`, `/profile`, `/promoter`, `/box-office`, `/scan`
- [ ] **Invisible events**: draft event URL → 404 publicly (visible to owner only); cancelled event → correct state; random fake UUID → 404
- [ ] **Dead referral links**: `/p/badslug` → clean redirect to `/` (no error); `/r/badslug` + expired `/r/` link → lands on `/list-your-event` with no attribution
- [ ] Direct URL access: non-owner hits `/organizer/events/[id]` → blocked; collaborator gets LIMITED view
- [ ] Organizer premium purchase (if enabled): premium price from settings, expiry respected
- [ ] Share/copy-link buttons on event + community pages
- [ ] Offline: kill network → themed offline page + snake game shows

 *

**Daily rhythm:** test during the day → send findings by evening → I fix overnight → next morning verify + move on. After Day 6 = deploy prep.