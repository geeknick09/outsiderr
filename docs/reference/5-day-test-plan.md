# 5-Day Full-App Test Plan

**Goal:** cover every user-facing flow + money path before go-live. Test each day, send findings nightly, fixes land overnight. Day 5 closes with a regression sweep over whatever broke earlier in the week.

**How to report findings** — copy this per issue and send at the end of each day:

```
Day N · [page/URL] · severity (blocker / major / minor)
What I did:
What happened:
What should happen:
Screenshot? yes/no
```

**Accounts you'll need (seeded dev users or fresh signups):**
- 1 admin (`is_admin` true)
- 1+ creator (creator profile submitted)
- 2+ plain users (one who joins communities/buys tickets, one who doesn't)
- 1 promoter account (for referral links + payout math)

Cross-reference `docs/reference/test-scenarios.md` for deep scenario detail per section.

---

## Day 1 — Discovery, auth, profile, creator onboarding

**Focus: can a brand-new user get in and orient?**

- [ ] Homepage loads; event grid renders (desktop + mobile)
- [ ] City switcher filters events + communities correctly
- [ ] Category/subcategory chips filter; no stale states
- [ ] Event card → detail page; poster, price, venue, date all correct
- [ ] Signup (email + Google), login, logout — all work; redirects back to the page you were on
- [ ] `/profile` — edit name/avatar/bio; interested-in categories drive the tag list (no giant wall of tags)
- [ ] Profile → Communities section shows joined communities; Following section lists followed organizers
- [ ] `/badges` — ladder shows earned vs locked with requirements
- [ ] Become a Creator (`/list-your-event`) — hero, orbit, three CTAs (Communities / Start Creating / Events)
- [ ] Creator wizard: name + terms required; PAN / GST / bank all skippable via "Skip - Add Later"
- [ ] When PAN filled: card photo required before Continue; Bank step needs UPI+acct+IFSC+name+proof OR skip
- [ ] Abandon onboarding mid-upload → uploaded media is cleaned up (check storage or ask me to verify)
- [ ] Submit bare application → dashboard opens, NO admin KYC notification
- [ ] Fill PAN+bank+GST later via Edit profile → goes to admin review
- [ ] Dashboard shows "Add your bank account" notice until bank details exist

## Day 2 — Creator: events + communities

**Focus: the full organizer toolkit.**

- [ ] Create event end-to-end: title/dates/venue(TBA + real)/tiers/pricing/categories/tags/photos
- [ ] Save draft → publish later via Publish button AND via edit → publish
- [ ] Edit event: every section saves independently; banner/poster/teaser upload
- [ ] Attach event to a community, change community, detach to public — all three paths
- [ ] Visibility: Open / Members-only / Invite-only — invite link works, broken link rejected
- [ ] Recurring (weekly) community event creates repeats
- [ ] Create community: name, category, **multiple subcategories**, prefilled terms (edit them)
- [ ] Community page: cover (16:9 + 3:4 mobile), avatar not clipped, join button (NO follow button)
- [ ] Manage community (`/organizer/communities/[id]`): Members / Requests / Import / Events / Analytics tabs
- [ ] Member count toggle → public page shows/hides "N members"
- [ ] Events tab lists community events w/ views, sold, check-ins, net payout
- [ ] Analytics tab: stats + "Interested, not converted" table (paginate 10/page, Export CSV, per-row Notify, Notify all)
- [ ] Join questions (private community) — request → approve → member list
- [ ] Team/collaborators: add co-organizer/staff; they see limited event manage UI; they CANNOT change community attach
- [ ] Box office PIN + scanner PIN generation on the event
- [ ] Guestlist link + waitlist toggle + "update me" subscription

## Day 3 — Money: bookings, refunds, payouts, promoters

**Focus: every rupee in and out. Keep a calculator handy.**

- [ ] Free event: book → ticket issued instantly
- [ ] Paid event: Razorpay checkout success → confirmed order + ticket + notification
- [ ] Payment failure/abandoned → order states correct, no ticket issued
- [ ] Convenience fee math: buyer pays ticket + fee; organizer gets subtotal - commission; verify paise-exact
- [ ] Phased pricing: early-bird vs later tier charges correct prices
- [ ] Max tickets per order enforced
- [ ] `/tickets` — QR visible, print ticket page works
- [ ] Cancel event → refund choices work; postpone → notify; verify money math
- [ ] Refund queue → Razorpay refund initiates; manual settle path works
- [ ] Organizer Ledger (`/organizer/payments`): every txn listed, net payout column correct
- [ ] Admin → Money → Payouts: create payout, mark complete w/ UTR; ledger updates
- [ ] **Promoter flow**: promoter link click → user books → commission accrues on organizer's tab
- [ ] Promoter payout: 2% processing fee deducted (check `payout_snapshot` shows gross + fee); min payout gate
- [ ] Guestlist ticket is ₹0 — no payment required
- [ ] Box office sale records + refunds correctly

## Day 4 — Admin console + notifications + door ops

**Focus: every admin surface.**

- [ ] `/admin` overview tiles load
- [ ] Events tab: list + per-event **Analytics** link → detail page (orders, money split, views, warm count, tiers, sales/day)
- [ ] Money hub: all 5 tabs render; refunds tab filter (queue/all/completed) preserved
- [ ] KYC review: approve/reject/clarify — creator notified
- [ ] Boosts: feature + slot requests, approve/reject, invoice
- [ ] Box Office hub: Orders / Staff / PINs tabs all work
- [ ] Compliance & Legal hub: tasks + legal page editor (version history, live version switch)
- [ ] Communities admin: pending approve/reject + live stats line per community
- [ ] Community imports: CSV import, row validation, approve
- [ ] Users/organizers lists; Settings: every field saves (esp. `promoter_payout_fee_bps`, `community_max_per_organizer`)
- [ ] Notifications: bell updates realtime (no refresh) — community notifications have View + Join inline
- [ ] Community event created/published → all ACCEPTED members notified (dedupe check — one notif per member)
- [ ] Scanner: PIN login, QR scan, check-in marks USED, duplicate scan rejected
- [ ] Box office: PIN login, sell ticket, cash/UPI record, door list

## Day 5 — Edges, regression, mobile

**Focus: break it.**

- [ ] Regression: rerun anything that failed Days 1-4
- [ ] Invite-only community event: no invite → blocked; valid invite → allowed
- [ ] Members-only event: non-member → blocked; member → allowed
- [ ] Ticket stock: buy last ticket → sold out state; no overselling under double-submit
- [ ] Refund deadline/cancellation window respected
- [ ] Waitlist: sold-out → join waitlist → slot opens → backfill notification
- [ ] Empty states everywhere: no events, no communities, no members, no tickets
- [ ] Mobile: homepage, event detail, create form, manage pages, admin — no overflow/clipped chips
- [ ] Legal pages render live versions; version switch works
- [ ] Community card on /communities: avatar + subcategory chip NOT clipped
- [ ] "Become a Creator" → "Creator Dashboard" swap in the menu when a creator logs in
- [ ] Sign out/in flows; rate limiting on repeated submits (try rapid double-click on book/join)
- [ ] Direct URL access: non-owner hits `/organizer/events/[id]` → blocked; non-admin hits `/admin` → blocked

---

**Daily rhythm:** test during the day → send findings by evening → I fix overnight → next morning verify + move on. Monday = deploy prep.
