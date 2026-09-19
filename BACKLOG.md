# Outsiderr — Product Backlog & Progress Tracker

## Purpose

This document tracks all product, engineering, infrastructure, payment, organizer, admin, notification, legal, analytics, and branding work for **Outsiderr**.

> **Read `PRODUCT_VISION.md` first.** Every feature decision must align with the product vision. If a proposed feature makes Outsiderr look more like a generic ticketing platform, question it. The vision is the north star — the backlog is the execution plan.

## Status markers

- `[x]` — Done
- `[~]` — In progress / partially done
- `[ ]` — Not started

## Recent progress snapshot (2026-09-19)

### Newly added / updated since the last backlog pass
- [x] **Admin KYC refresh fix** — KYC approval, rejection, and clarification now invalidate the admin KYC page and trigger a client refresh so approved entries disappear from the pending list immediately instead of staying stale.
- [x] **Pagination fix for admin and organizer lists** — The admin users page and organizer order list now page correctly instead of continuing to scroll endlessly.
- [x] **Supabase typed update fix** — Organizer update payloads now conform to the generated `organizers` table types, resolving the `Record<string, string | null>` assignment issue.
- [x] **Build stability cleanup** — Stale `.next` build artifacts were cleared and the app was rebuilt successfully after the Windows EPERM/stale cache issue.

### Already completed and reflected in the backlog
- [x] **P62. KYC Admin Review Workflow** — Complete as listed in the backlog.
- [x] **P15. Centralized Admin Dashboard** — Complete as listed in the backlog.
- [x] **P27. Organizer Analytics** — Complete as listed in the backlog.
- [x] **P28. Hero Boost Payment System** — Complete as listed in the backlog.
- [x] **P33. Hero/Featured Event Boosting System (V1)** — Complete as listed in the backlog.
- [x] **P58. Follow/Unfollow Organizers** — Complete as listed in the backlog.
- [x] **P59. Event Collaboration (Co-Organizer Invites)** — Complete as listed in the backlog.
- [x] **P60. Co-Organizer Permission Levels** — Complete as listed in the backlog.
- [x] **P61. Category: Gaming + Fitness Rename** — Complete as listed in the backlog.

---

## 1. Payment & Monetization

- [ ] **P1. Razorpay Integration** — Server-action flow: create order, Checkout, verify payment, webhook handling, refunds (full + partial), transaction persistence. Keep manual UPI as fallback.
- [x] **P2. Door Staff Payment System** — Tiered pricing from platform settings, `door_staff_orders` table, UPI QR + UTR submission flow. Razorpay integration deferred.
- [x] **P3. Event Cancellation & Refund Engine** — CANCELLATION_REQUESTED → CANCELLED flow, refund records, notifications. Cancellation charge configurable from settings (default 20%).
- [x] **P4. Event Postponement / Rescheduling** — POSTPONED status, notify ticket holders, user chooses keep/refund. Postponement charge configurable (default 10%). Server + client date validation.
- [x] **P5. Platform Commission Configuration** — `platform_settings` table with admin-configurable commission, charges, door staff pricing, boost pricing, hero boost pricing, terms version, WhatsApp number.
- [x] **P28. Hero Boost Payment System** — Manual UPI + UTR flow for Hero Boost purchases. Admin verifies payment and activates boost. Price from platform settings (₹999 default). Idempotent — unique index prevents duplicate active boosts per event.

---

## 2. Authentication & User Profile

- [ ] **P6. Phone + OTP Authentication** — Currently using email/password. Phone OTP deferred.
- [ ] **P7. Guest Checkout / OTP Checkout** — Prefill profile for logged-in users. New users go through checkout flow.
- [x] **P29. Profile Menu — Dynamic Organizer Label** — Shows "List Your Event" for non-organizers (links to `/list-your-event`) and "Manage Your Events" for organizers (links to `/organizer`). Organizer status checked in navbar and passed to user menu.

---

## 3. Event Creation & Organizer

- [x] **P8. Organizer T&C Acceptance** — `event_terms_acceptances` table stores terms_version + accepted_at. Version shown in event form.
- [x] **P9. Venue Announcement System** — "To Be Announced" radio mode in event form. Venue fields hidden when TBA. Google Maps link validation (client + server). Venue announcement deadline from settings (default 48h).
- [x] Event creation (title, description, tags, category, city, venue, map picker, Google Maps link)
- [x] Event editing (with map + Google Maps link, dynamic tier add/remove, dirty state tracking)
- [x] Pricing modes (FREE / FLAT / PAID) with multi-tier tickets
- [x] Poster upload to Supabase Storage
- [x] Organizer profile creation (become-organizer form with photo upload)
- [x] Organizer profile edit (update name, bio, photo, UPI ID with validation + QR preview after creation)
- [x] **P30. Event Gallery** — Organizers can add up to 8 photos via upload or URL. Editable in both create and edit forms. Displayed on public event page via PhotoGallery component.
- [x] **P31. Organizer Contact Details** — Contact email and phone fields in event create + edit forms. Displayed on public event page with mailto/tel links.
- [x] **P32. Tier Field Validation** — Client-side min/max/minLength attributes + server-side validation for tier name (≥2 chars), price (≥₹1), quantity (≥1).
- [x] **P51. Time-Based Phased Flat Pricing** — Organizers can create sequential flat-price phases (e.g. Early Bird → Phase 2 → Normal) with per-phase ticket allocation, open/close dates, and automatic carry-forward of unsold tickets. Phases switch on date OR sell-out. Named tiers (VIP, etc.) can coexist alongside phases. Door scanner prominently shows which tier/phase each ticket came from. Active phase and phase timeline shown on public event page.
- [x] **P52. User Profile Page** — `/profile` route with name, birthdate, phone, email (read-only), and interested-in tags. Edit form with tag picker (chips from PREDEFINED_EVENT_TAGS). Auto-merge event tags into user's interested-in list when they book an event. "My Profile" link added to navbar user menu.
- [x] **P53. Organizer Profile Redesign** — Facebook-style cover banner + round/square DP on `/organizers/[id]`. Cover photo upload in become-organizer form and edit-profile form. Split upcoming/past events sections. Past events show "Completed" badge.
- [x] **P54. Past Event Booking Guard** — TicketTiers component disables booking for past events, shows "Event ended" message instead of "Book now" button.
- [ ] **P55. Follow/Unfollow Organizers** — Users can follow organizers. Follower count on profile. Feed of followed organizers' events. (Deferred)
- [x] **P56. Organizer Rating & Reviews** — Checked-in attendees (USED ticket) can leave 1-5 star + text reviews. Reviews aggregate on organizer profile with average rating + distribution. Reviews also show on completed event pages. RLS: public read, checked-in insert, author delete + admin delete. Organizers cannot delete reviews. Server actions: `submitReview`, `deleteReview` (own), `adminDeleteReview` (admin only).
- [x] **P57. "Update Me" Event Subscriptions** — Per-event subscription button on public event page. Users who haven't booked yet can subscribe to get notified about changes (venue, city, time), reminders, and ticket availability. `event_subscriptions` table with RLS + realtime. Subscribe/unsubscribe server actions. Notification code merges ticket holders + subscribers (both get notified on event changes).
- [x] **P58. Follow/Unfollow Organizers** — Users can follow any organizer from their public profile page (`/organizers/[id]`). Follower count displayed on profile. `organizer_follows` table with RLS + realtime. Follow/unfollow server actions. Follow is display-only (no notification feed) per product decision.
- [x] **P59. Event Collaboration (Co-Organizer Invites)** — Primary organizer can invite other organizers to co-host an event. Invite/accept/reject flow with notifications. Co-organizers shown on public event page. `event_collaborators` table with RLS + realtime. Collaboration invites shown on organizer dashboard.
- [x] **P60. Co-Organizer Permission Levels** — Primary owner picks a permission level at invite time: `VIEW_ONLY` (dashboard + read), `ANALYTICS` (view + analytics + orders), `SCAN` (view + scan tickets only), `FULL` (everything except delete). Owner can change permission level anytime via dropdown. Co-organized events appear in co-organizer's dashboard with "Co-organizer" badge. All event sub-pages (management, scan, orders, check-ins, report) gated by permission level.
- [x] **P61. Category: Gaming + Fitness Rename** — "Fitness" category label changed to "Alternate Sports & Fitness". New "Gaming" category added (`GAMING` enum value). Gaming tags added (Esports, LAN Tournament, FIFA, BGMI, Valorant, Free Fire, Call of Duty, Console Night, Retro Gaming, Arcade, Speedrun). Migration applied to live DB.

---

## 4. Online Events

- [ ] **P10. Online Event Support** — Physical vs Online toggle, meeting platform (WhatsApp/Zoom/Teams), meeting URL, access instructions.

---

## 5. Notification System

- [ ] **P11. Central Notification Infrastructure** — Common `sendNotification(user, type, data)` abstraction.
- [ ] **P12. User Notifications** — Booking success/fail, ticket generated/cancelled, refund updates, event changes.
- [ ] **P13. Organizer Notifications** — Event reminders, venue reminders, sales milestones, door staff payment pending.
- [x] Basic `event_notifications` table exists (cancellation/postponement notifications).

---

## 6. Communication Providers

- [ ] **P14. SMS / Email / WhatsApp Integration** — Provider integrations behind common interfaces.

---

## 7. Admin Dashboard

- [x] **P15. Centralized Admin Dashboard** — Overview, events, orders, boosts, hero boosts, clubs, users, door staff, settings, legal pages, revenue. Admin overview stats include both slot + hero boost counts, gross revenue, platform commission, and net payouts. Pending hero boost alert banner. RBAC deferred.
- [x] Admin settings page (`/admin/settings`) — saves in both demo and Supabase mode with success indicator. Categorized form fields (Commission, Boosts, Door Staff, Charges, Taglines, Other) with per-field and per-section save.
- [x] Admin door staff page (`/admin/door-staff`) — shows event titles instead of truncated UUIDs.
- [x] Admin hero boosts page (`/admin/hero-boosts`) — summary cards, full boost list, verify/activate/reject/cancel actions. Cross-linked to slot boosts page.
- [x] Admin legal pages page (`/admin/legal`) — CRUD for database-backed legal pages. Admin can create new pages, edit existing, and delete.
- [x] Admin users page — shows multiple demo users (not collapsed to one). Toggle admin status.
- [x] Admin boosts page (`/admin/boosts`) — approve/reject slot-based boosts. Cross-linked to hero boosts page.
- [x] Admin events page (`/admin/events`) — search by title, filter by status/city/category, inline edit form for event details, feature/unfeature, cancel/re-publish, delete.
- [x] Admin revenue page (`/admin/revenue`) — gross revenue, platform commission, net payouts, per-event breakdown table.
- [x] Admin strict authorization — `requireAdmin()` and `checkAdmin()` no longer have zero-admin fallback. Only `is_admin = true` users can access `/admin` or perform admin actions.
- [ ] Admin policy management (beyond legal pages CRUD)
- [ ] Admin analytics (DAU/MAU/trends)

---

## 8. Event Boosting / Promotions

- [x] **P16. Boost Management (Slot-based)** — Boost panel with manual UPI. Admin can approve/reject. Slot-based pricing from settings.
- [x] **P33. Hero/Featured Event Boosting System (V1)** — Complete implementation:
  - `hero_boosts` table with RLS, unique active-per-event index.
  - 7-day duration, auto-expires at `min(started_at + 7 days, event.starts_at)`.
  - Deterministic rotation: `rotation_index = floor(now / interval)`, sorted by event date proximity, rotated by offset.
  - Up to 7 visible at a time (configurable), rotation every 30 minutes (configurable).
  - Eligibility enforced server-side: boost ACTIVE, not expired, event published, not started, not cancelled.
  - Organizer UI: purchase, UTR submission with UPI QR, status display.
  - Admin UI: verify/activate, cancel, view all boosts with payment details.
  - Homepage `HeroCarousel` with auto-rotation, dot indicators, `?source=HERO_BOOST` tracking.
  - Cancellation integration: cancelled events removed from Hero immediately.
  - Postponement: eligibility auto-re-evaluated via timestamp queries.
  - Empty slot handling: rotation recalculated from eligible pool each request.
  - Price from platform settings (₹999 default), not hard-coded.
  - Configurable: `hero_boost_enabled`, `hero_boost_price`, `hero_boost_duration_days`, `hero_rotation_interval_minutes`, `hero_max_visible_events`.

---

## 9. Legal / Policy Pages

- [x] **P17. Legal Pages** — Database-backed legal pages with public routes at `/legal/[slug]`. Terms, Refund Policy, Cancellation Policy, Privacy Policy, etc.
- [x] **P18. Central Policy Management** — Admin-editable policy content with versioning (`legal_pages` table, admin CRUD at `/admin/legal`, public rendering at `/legal/[slug]`).
- [x] About Us page (`/about`)
- [x] Contact Us page (`/contact`)

---

## 10. Data & Media Lifecycle

- [ ] **P19. 3-Month Data Retention / Archival** — Archive old data, preserve financial/legal records.
- [ ] **P20. Media Cleanup** — Reference-aware cleanup of orphaned files.

---

## 11. Branding & UI

- [x] **P21. Outsiderr Logo** — Dark and light mode logos (`darkmode.png`, `lightmode.png`) with theme-aware switching via `ThemeLogo` component. Used in navbar, favicon, PWA manifest, and service worker.
- [x] **P22. Loading / Buffering Animation** — Branded neon-gradient spinner (`BrandedLoader`) added to all 13 `loading.tsx` route fallbacks. Skeletons retained for content structure, spinner provides instant branded feedback.
- [x] **P34. Profile Dropdown UX** — Auto-close on navigation and outside click. Fixed z-index overlay (z-40 overlay, z-50 menu). Dark-mode mobile styling fixed.
- [x] **P35. Post-Payment Success UI** — Green confirmation message + WhatsApp instructions for UTR submission on checkout and tickets pages.
- [x] **P37. Leaflet SSR Fix** — MapPicker changed from `React.lazy()` to `next/dynamic` with `ssr: false` in both event-form and edit-event-form. Fixes `window is not defined` error on `/organizer/events/[id]`.
- [x] **P38. Hero Boost Error Handling** — Supabase errors (PostgrestError) now properly extracted in all hero boost actions. Added `console.error` logging. `getHeroBoostForEvent` and `getHeroEvents` catch errors gracefully instead of crashing pages.
- [x] **P39. Admin/Hero Boost Sync** — Admin overview stats now include hero boost counts (active + pending). Pending hero boost alert banner on admin overview with link to `/admin/hero-boosts`. Cross-links between Slot Boosts and Hero Boosts admin pages.
- [x] **P40. Standalone Hero Boosts Migration** — Created `supabase/migrations/hero_boosts.sql` with table creation, settings inserts, indexes, and RLS policies for easy one-shot execution in Supabase SQL Editor.
- [x] **P41. Organizer KYC / Banking Onboarding** — 5-step wizard collecting PAN, GST (optional), bank account, UPI, and organizer agreement. Schema extended with `pan_number`, `pan_name`, `gst_number`, `gst_business_name`, `bank_account_number`, `bank_ifsc`, `bank_account_name`, `bank_account_type`, `kyc_submitted` columns. PAN format (`ABCDE1234F`) and IFSC format (`ABCD0123456`) validated server-side.
- [x] **P62. KYC Admin Review Workflow** — Admin review gate for organizer applications. `kyc_status` column (`NOT_SUBMITTED` / `PENDING` / `APPROVED` / `REJECTED` / `CLARIFICATION_NEEDED`) on `organizers` table. Admin page at `/admin/kyc` lists submissions with filter tabs (Pending, Clarification Needed, Approved, Rejected, All). Admin can approve, reject (with reason), or request clarification (with note). Notifications sent to organizer's bell icon: `KYC_APPROVED`, `KYC_REJECTED`, `KYC_CLARIFICATION` ("An Outsiderr team member will contact you"). Organizer dashboard shows status banner (pending/rejected/clarification). New KYC submissions set `kyc_status = PENDING` automatically.
- [x] **P42. List Your Event Landing Page** — Marketing page at `/list-your-event` with hero, stats, how-it-works, feature cards, category chips, and CTA. "Get Started" routes to `/organizer`. Navbar "List your event" link removed; access via profile menu and footer.
- [x] **P43. Per-Event Door Scanner** — Scanner moved from universal (`/organizer/scan`) to per-event (`/organizer/events/[id]/scan`). Validates both ticket authenticity and event ID match. Door scanner button removed from organizer dashboard header; only visible on individual event management pages.
- [x] **P63. Scanner PIN Staff Contact Info** — Scanner PINs now store optional `staff_email` and `staff_phone` alongside `staff_name`. Single PIN mode has email + phone fields. Bulk "paste names" mode has parallel email/phone text areas. Active PIN list displays email (with mail icon) and phone (with phone icon) for each staff member. `generate_scanner_pins` RPC updated to accept `p_staff_emails` and `p_staff_phones` arrays.
- [x] **P44. Past Events Handling** — Events past their start date are excluded from Featured, Happening Today, Popular, and All Events sections. New "Past Events" section at bottom of homepage with disabled (non-clickable) cards showing "Completed" badge. Organizer dashboard and event management page show "Completed" status for past events. Past events are read-only — edit form, hero boost, door staff, cancel/postpone, publish, and door scanner all hidden.
- [x] **P45. Platform Footer** — District-style footer with 4 columns: Brand + social icons (Instagram, Facebook, YouTube, WhatsApp), Help (Contact Us), Quick Links (Become an Organizer / Manage Your Events based on organizer status, Join a Club / Crew, About Us), Legal (Terms, Privacy, Refund, Cancellation). Bottom bar with copyright, legal links, and consent notice. Responsive (stacks on mobile).
- [x] **P46. Dynamic Platform Commission** — Platform fee now sourced from admin settings (`platform_fee_bps`) instead of hardcoded constant. `calculatePrice()` and `platformFee()` accept `feeBps` parameter. Checkout, order creation, and ticket tier preview all fetch the dynamic fee. Fee percentage label updates automatically (e.g. "Platform fee (5%)").
- [x] **P47. Admin-Configurable Taglines** — Three new platform settings: `tagline_header`, `tagline_subheader`, `tagline_footer`. Homepage header and footer render dynamic taglines from settings. Admins can change them from the Settings panel.
- [x] **P48. Legal Page Markdown Rendering** — Lightweight markdown parser for legal pages (`#`/`##` headings, `-` bullet lists, paragraphs). Handles both real newlines and literal `\n` escape sequences from PostgreSQL. SQL seeds updated to use `E''` escape syntax.
- [x] **P49. Expandable Ticket Cards** — Ticket wallet cards are now click-to-expand. Compact card shows small QR + event details; clicking opens a full-size modal with large QR (220px), event name, tier, date/time, venue, check-in time, and download button. Expired tickets (past event date) are dimmed, grayscale, non-clickable, with "EXPIRED" stamp over QR and "Event Ended" badge.
- [x] **P50. Homepage Copy Update** — Tagline changed from "Discover raw underground events happening today near you." to "Discover raw events happening today near you." (removed "underground" since run clubs/marathons aren't underground). Footer tagline updated to match.

---

## 12. Domain & Infrastructure

- [ ] **P23. Connect Custom Domain to Vercel** — DNS, SSL, HTTPS, redirect strategy.

---

## 13. Infrastructure & Automation

- [ ] **P24. Scheduled Jobs / Cron** — Venue reminders, event reminders, boost expiry, media cleanup, refund checks. Hero boost expiry is timestamp-based (no cron needed for eligibility).
- [ ] **P25. Payment Webhook Infrastructure** — Razorpay webhook endpoint (when Razorpay is integrated).

---

## 14. Analytics

- [ ] **P26. Event Analytics** — Views, unique visitors, conversion rate, sales over time, cancellation/refund rate.
- [x] **P27. Organizer Analytics** — Per-event analytics (orders, revenue, payout, check-ins, waitlist) + aggregate dashboard with overview stats, capacity bar, attendance/order charts, revenue-by-event top 5, and 30-day revenue trend chart.
- [x] **P36. Hero Boost Analytics Prep** — Hero carousel links include `?source=HERO_BOOST` query param for tracking traffic/bookings from Hero section. Extensible for future analytics integration.

---

## 15. Engineering Rules

- [x] **Rule 1 — Inspect before modifying** — Existing patterns reused.
- [ ] **Rule 2 — Never expose secrets** — Razorpay keys not yet in use. Must use server-only env vars.
- [ ] **Rule 3 — Financial operations server-side** — Razorpay verification will be server-side. Hero boost activation is server-side (admin only).
- [x] **Rule 4 — Database is source of truth** — Payment status only changes after server verification. Hero boost status managed server-side. Supabase errors properly propagated to user-facing messages.
- [x] **Rule 5 — Idempotency** — Hero boost unique index prevents duplicate active boosts. Manual UPI flow is inherently idempotent (admin verifies before activating).
- [x] **Rule 6 — Soft delete financial records** — No hard deletes. Events use status lifecycle. Hero boosts use CANCELLED/EXPIRED, never deleted.
- [x] **Rule 7 — Configurable business rules** — `platform_settings` table implemented. Hero boost price, duration, rotation, max visible all configurable.
- [x] **Rule 9 — Graceful degradation** — Hero boost queries return empty arrays / null on database errors instead of crashing pages. Missing table doesn't break the homepage or organizer event page.
- [ ] **Rule 8 — Audit important actions** — Audit log table not yet created.

---

## 16. Completed Items (all sessions)

### Core Event System
- [x] Event creation with map picker + Google Maps link
- [x] Event editing with map + Google Maps link, dynamic tier add/remove, dirty state
- [x] Pricing modes (FREE / FLAT / PAID) with multi-tier tickets
- [x] Poster upload to Supabase Storage (card + banner)
- [x] Event gallery (up to 8 photos, upload or URL, editable)
- [x] Organizer contact details (email, phone) in event forms + public page
- [x] Tier field validation (client + server)
- [x] Venue TBA mode + Google Maps link validation
- [x] Tags based on category chips (TagPicker component)

### User
- [x] User profile page (`/profile`) with name, birthdate, phone, email, interested-in tags
- [x] Auto-merge event tags into user's interested-in list on booking
- [x] "My Profile" link in navbar user menu
- [x] Past event booking guard (TicketTiers shows "Event ended" for past events)

### Organizer
- [x] Organizer profile creation (become-organizer form)
- [x] Organizer profile editing (name, bio, photo, cover photo, UPI ID with validation + QR preview)
- [x] Organizer T&C versioning (terms_version + accepted_at)
- [x] UPI ID validation + QR code generation
- [x] Dynamic organizer heading on dashboard (cover banner + avatar + name, bio, verified badge)
- [x] Public organizer profile page (`/organizers/[id]`) with Facebook-style cover + DP, split upcoming/past events
- [x] "List Your Event" / "Manage Your Events" dynamic label in profile menu
- [x] 5-step KYC onboarding wizard (profile, PAN, GST optional, bank+UPI, agreement)
- [x] List Your Event landing page (`/list-your-event`)

### Booking & Tickets
- [x] Booking system (manual UPI + UTR)
- [x] Ticket generation with QR codes
- [x] Ticket wallet (`/tickets`) with expandable ticket cards
- [x] Expired tickets (past event date) shown dimmed, grayscale, non-clickable with "EXPIRED" stamp
- [x] RSVP form with email/gender (optional)
- [x] Share event button (Web Share API + clipboard fallback, dynamic origin URLs)
- [x] Print report (window.print in client component)
- [x] Per-event door scanner (html5-qrcode, lazy loaded, organizer-only, event ID validation, cooldown)
- [x] Post-payment green success message + WhatsApp instructions

### Event Lifecycle
- [x] Cancel event flow (CANCELLATION_REQUESTED → CANCELLED, refund records, notifications)
- [x] Postpone event flow (POSTPONED, notify ticket holders, server + client date validation)
- [x] Configurable cancellation/postponement charges

### Boosting & Promotions
- [x] Slot-based boost management (manual UPI, admin approve/reject)
- [x] Hero/Featured Event Boosting V1 (7-day, rotation, eligibility, organizer + admin UI, homepage carousel)

### Engagement & Community
- [x] "Update Me" event subscriptions (per-event, notify on changes/reminders/availability)
- [x] Follow/unfollow organizers (follower count on profile, display-only)
- [x] Event collaboration (co-organizer invites, accept/reject, co-organizer display on event page)
- [x] Co-organizer permission levels (VIEW_ONLY, ANALYTICS, SCAN, FULL — owner picks at invite, changeable anytime)
- [x] Co-organized events appear in co-organizer's dashboard with badge
- [x] All event sub-pages gated by permission level (management, scan, orders, check-ins, report)

### Categories
- [x] "Fitness" renamed to "Alternate Sports & Fitness"
- [x] New "Gaming" category added (GAMING enum + gaming tags)

### Clubs & Crews
- [x] Clubs & crews (create, join, members, admin verification)
- [x] Club display picture + Facebook-style cover photo
- [x] Paid club membership via UPI (UPI ID + QR from creator)

### Admin
- [x] Centralized admin dashboard (overview, events, orders, revenue, boosts, hero boosts, clubs, users, door staff, settings, legal)
- [x] Admin settings page with categorized form fields (Commission, Boosts, Door Staff, Charges, Taglines, Other)
- [x] Admin door staff management page (shows event titles)
- [x] Admin hero boosts management page (verify/activate/cancel, summary cards)
- [x] Admin overview includes hero boost stats + gross/net revenue + pending alert banner
- [x] Admin legal pages CRUD (create, edit, delete)
- [x] Admin users page (multiple demo users tracked separately, toggle admin)
- [x] Admin boosts page (approve/reject slot-based boosts)
- [x] Admin events page (search, filter, inline edit, feature/unfeature, cancel, delete)
- [x] Admin revenue analytics page (gross, commission, net payouts, per-event breakdown)
- [x] Admin strict authorization (no zero-admin fallback, is_admin only)
- [x] Cross-links between Slot Boosts and Hero Boosts admin pages
- [x] Targeted revalidation — admin actions instantly reflect on user/organizer pages

### Door Staff
- [x] Door staff tiered pricing from settings
- [x] Door staff order creation + UPI QR payment + UTR submission
- [x] Door staff availability count in admin settings
- [x] Door staff request from event management page
- [x] Door scanner removed from organizer dashboard (per-event only)

### Legal & Info Pages
- [x] Database-backed legal pages (Terms, Refund, Cancellation, Privacy, etc.)
- [x] Admin legal pages CRUD at `/admin/legal`
- [x] Public legal pages at `/legal/[slug]` with markdown rendering
- [x] About Us page (`/about`)
- [x] Contact Us page (`/contact`)
- [x] Platform footer with social links, quick links, legal links, consent notice

### Platform & Infrastructure
- [x] Platform settings table + admin settings page
- [x] Dynamic platform commission from admin settings (not hardcoded)
- [x] Admin-configurable taglines (header, subheader, footer)
- [x] Past events excluded from active sections; "Past Events" section with disabled cards
- [x] Demo mode with process-local store (events, orders, tickets, waitlist, boosts, clubs, clubMembers, doorStaffOrders, platformSettings, users, legalPages, heroBoosts)
- [x] PWA support (manifest, service worker, icons)
- [x] Theme-aware logo (dark/light mode switching)
- [x] Loading skeletons
- [x] Profile dropdown UX (auto-close, dark-mode mobile, z-index)
- [x] Leaflet SSR fix (next/dynamic ssr:false instead of React.lazy)
- [x] Hero boost error handling (Supabase error extraction, graceful degradation)
- [x] Admin/hero boost sync (overview stats include hero boosts, pending alert banner, cross-links)
- [x] Standalone hero_boosts migration SQL file (`supabase/migrations/hero_boosts.sql`)

---

## 17. Known Issues & Action Required

- [ ] **Run `supabase/migrations/fix_all.sql`** in Supabase SQL Editor — Must be re-run to apply: strict admin function (no fallback), commission tier settings, phased pricing columns on `ticket_tiers` (`tier_type`, `phase_order`, `phase_opens_at`, `phase_closes_at`), user profile columns on `profiles` (`birth_date`, `interested_tags`, `instagram_url`), cover photo + Instagram URL columns on `organizers` (`cover_url`, `instagram_url`), Instagram URL column on `events` (`instagram_url`), and all prior migrations.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after QA fixes) — Now includes: secured `approve_order`/`reject_order` RPCs with `is_event_staff` auth check + stock check, new `cancel_event` atomic RPC, new `postpone_event` atomic RPC, unique constraint on `club_members(club_id, user_id)`, **updated `create_paid_order` RPC with fee snapshot parameters** (`p_commission_paise`, `p_convenience_fee_paise`, `p_organizer_payout_paise`), **`check_in_ticket` RPC** (door scanner check-in with `p_event_id` parameter).
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after Razorpay migration) — Now includes: Razorpay notification types (`PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `REFUND_INITIATED`, `REFUND_COMPLETED`, `PAYOUT_COMPLETED`).
- [ ] **Run `scripts/apply-razorpay-migration.mjs`** — Applies the Razorpay schema migration to the live Supabase database (new order statuses, Razorpay columns on orders/hero_boosts/refunds, `webhook_events`, `payment_ledger`, `payout_records`, `invoice_number_seq`, new RPCs: `create_reserved_order`, `confirm_razorpay_order`, `fail_razorpay_order`, `expire_reserved_orders`, `set_razorpay_order_id`).
- [ ] **Run `scripts/add-notification-types.mjs`** — Adds the new Razorpay notification types to the `event_notification_type` enum.
- [ ] **Run `supabase/migrations/wipe_all.sql`** if you want a clean reset — now includes commission tier seeds and auto-promote first admin trigger.
- [ ] **Set Razorpay env vars** — `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`).
- [ ] **Configure Razorpay webhook** — Set the webhook URL to `https://yourdomain.com/api/razorpay/webhook` in the Razorpay dashboard and subscribe to `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed` events.
- [ ] **Configure Vercel Cron** — Add a cron job to call `GET /api/cron/expire-reservations` with `Authorization: Bearer <CRON_SECRET>` every 1 minute to expire stale reservations.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after UX fixes) — Now includes: `waitlist_enabled` column on `events` (boolean, default true), updated RLS policy to allow `POSTPONED` events to be publicly visible, 15 performance indexes (events status/city/categories GIN/trigram, orders status/date/razorpay_order_id/user_id, profiles is_admin/created_at, hero_boosts razorpay_order_id, webhook_events processed, refunds razorpay_refund_id/order_id, payment_ledger razorpay_payment_id), `pg_trgm` extension, nullable `p_razorpay_signature` parameter on `confirm_razorpay_order`.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after event lifecycle features) — Now includes: `event_staff` table for door staff access (organizer assigns by email/phone, staff only access `/scan`), `REFUND_REQUESTED` order status, `request_postponement_refund` RPC (user requests refund for postponed event), updated `is_event_staff` to check `event_staff` table, `is_door_staff_any()` and `get_staff_organizer_ids()` functions, `events` table added to realtime publication, `event_staff` RLS policies.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after walk-in/manual check-in features) — Now includes: `order_source` column on `orders` (discriminates online vs walk-in orders), `create_walkin_order` RPC (organizer registers a walk-in attendee with QR ticket or instant check-in), `update_walkin_order` RPC (organizer edits an existing walk-in record). Walk-ins have `convenience_fee = 0` but commission is still deducted. Modes: `WALKIN_PREEVENT` (before event, VALID ticket), `WALKIN_QR` (during event, VALID ticket for scanning), `WALKIN_INSTANT` (during event, auto check-in, USED ticket). Also adds `allow_booking_during_event` column on `events` (boolean, default false) — when true, online booking stays open until the event ends instead of closing at the start time.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after scanner/box office PIN features) — Now includes: `is_box_office` column on `orders` (boolean, default false), `scanner_pins` table (PIN-based door scanner auth, no Supabase login needed), `box_office_pins` table (PIN-based box office auth, organizer + admin roles), `verify_scanner_pin` RPC, `generate_scanner_pins` RPC (bulk generate), `revoke_scanner_pin` RPC, `verify_box_office_pin` RPC, `generate_box_office_pins` RPC (bulk generate), `revoke_box_office_pin` RPC, RLS policies for both PIN tables, both tables added to realtime publication. Also updates `create_walkin_order` to set `user_id = NULL` and `is_box_office = true` (walk-in orders no longer appear in My Tickets), and updates `check_in_ticket` to return `buyer_name` from the order as `holder_name` (scanner shows attendee name, not organizer name).
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after hardening features) — Now includes: `idempotency_key` column on `orders` with unique partial index (prevents duplicate box-office orders), `pin_hash` column on `scanner_pins` and `box_office_pins` with SHA-256 hash + unique index (PINs are hashed, not stored as plaintext for verification), updated `create_walkin_order` RPC with `p_idempotency_key` parameter (returns existing order if key matches), updated all 4 PIN RPCs to verify via `pin_hash` instead of `pin_code`. Migrations have been applied to the live DB via `scripts/_apply_idempotency.mjs` and `scripts/_apply_pin_hashing.mjs`.
- [ ] **Run `scripts/_apply_backup_bucket.mjs`** — Creates the private `backups` Supabase Storage bucket for automated database backups. Then run `supabase/migrations/fix_all.sql` (re-run after backup feature) to add RLS policies for the backups bucket (service-role only). Configure Vercel Cron for `/api/cron/backup?type=daily` (2 AM) and `/api/cron/backup?type=weekly` (3 AM Sundays) — see `vercel.json`.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after reviews feature) — Now includes: `event_reviews` table (id, event_id, organizer_id, user_id, rating 1-5, review_text, created_at) with unique(event_id, user_id) constraint, 3 indexes, RLS (public read, checked-in users can insert, users delete own), and realtime publication. Reviews appear on organizer public profile page.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after linked events feature) — Now includes: `events.linked_past_event_ids` column (uuid[], default '{}'). Organizers can link their own past events as "previous editions" when creating/editing an event. Linked events show on the event page with aggregate rating.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after engagement features) — Now includes: `event_subscriptions` table (per-event "Update Me" subscriptions), `organizer_follows` table (follow/unfollow organizers), `event_collaborators` table (co-organizer invites), `permission_level` column on `event_collaborators` (VIEW_ONLY/ANALYTICS/SCAN/FULL), `GAMING` enum value on `event_category`, new notification types (COLLAB_INVITE, COLLAB_ACCEPTED), RLS policies for all three engagement tables, and realtime publication for all three tables. Migration applied to live DB via `scripts/_apply_fix_all.mjs`.
- [ ] **Run `supabase/migrations/fix_all.sql`** (re-run after KYC review + scanner contact features) — Now includes: `kyc_status` column on `organizers` (NOT_SUBMITTED/PENDING/APPROVED/REJECTED/CLARIFICATION_NEEDED), `kyc_reviewed_at` and `kyc_review_note` columns on `organizers`, `staff_email` and `staff_phone` columns on `scanner_pins`, updated `generate_scanner_pins` RPC (accepts `p_staff_emails` + `p_staff_phones` arrays), new notification types (KYC_APPROVED, KYC_REJECTED, KYC_CLARIFICATION), backfill of existing organizers with `kyc_status = PENDING` where `kyc_submitted = true`. Migration applied to live DB via `scripts/_apply_fix_all.mjs`.

---

## 18. Remaining Work (Not Started)

### High Priority
- [x] **Razorpay Integration** — Server-side order creation, Checkout, payment verification, webhook handling, auto-refunds. **IMPLEMENTED** — paid ticket checkout and Hero Boost purchases now use Razorpay Checkout. Free events remain unchanged. Legacy UPI/manual verification kept for historical orders only.
- [ ] **Custom Domain + Vercel** — DNS, SSL, HTTPS, redirect strategy.
- [ ] **Phone + OTP Authentication** — Replace email/password with phone OTP.
- [ ] **Central Notification Infrastructure** — Common `sendNotification(user, type, data)` abstraction.
- [ ] **SMS / Email / WhatsApp Integration** — Provider integrations behind common interfaces.

### Medium Priority
- [ ] **Online Event Support** — Physical vs Online toggle, meeting platform, meeting URL.
- [ ] **Guest Checkout / OTP Checkout** — Prefill profile for logged-in users.
- [ ] **Event Analytics** — Views, unique visitors, conversion rate, sales over time.
- [ ] **Scheduled Jobs / Cron** — Venue reminders, event reminders, boost expiry job, media cleanup, refund checks.
- [ ] **Payment Webhook Infrastructure** — Razorpay webhook endpoint.
- [ ] **Admin Analytics** — DAU/MAU/trends.
- [ ] **Audit Log Table** — Track important admin/organizer actions.

### Post-Launch — Refund Fee Bearer Choice + Organizer Settlement Dues

> **Status:** Designed, not yet implemented. Scheduled for after first launch.
> **Scope:** Cancellation and postponement refund flows.

#### Feature: Organizer chooses who bears the convenience fee

When an organizer cancels or postpones an event (and when a user requests a postponement refund), the organizer should be able to choose who bears the convenience fee (e.g., 3%):

- **Option A — Organizer bears the convenience fee:**
  - Buyer receives a **full refund** = subtotal + convenience_fee
  - Organizer's settlement dues increase by: total convenience_fee + cancellation_charge
  - Platform keeps: commission + cancellation_charge
  - Razorpay refund amount = order.total_paise (full)

- **Option B — User bears the convenience fee:**
  - Buyer receives a **partial refund** = subtotal only (convenience_fee is deducted, not refunded)
  - Platform keeps: commission + convenience_fee + cancellation_charge
  - Organizer's settlement dues increase by: cancellation_charge only
  - Razorpay refund amount = order.subtotal_paise (partial)
  - The user is clearly notified that the convenience fee is non-refundable per the organizer's policy

#### Worked example (5 tickets × ₹200, 3% convenience fee, 5% cancellation charge)

| Item | Amount |
|---|---|
| Subtotal (5 × ₹200) | ₹1,000 |
| Convenience fee (3%) | ₹30 |
| Total paid by buyers | ₹1,030 |
| Cancellation charge (5% of subtotal) | ₹50 |

**If organizer bears convenience fee:**
- Each buyer gets: ₹206 (full refund)
- Organizer owes platform: ₹30 (convenience) + ₹50 (cancel charge) = ₹80
- Platform net: keeps commission + ₹80 from organizer

**If user bears convenience fee:**
- Each buyer gets: ₹200 (subtotal only, ₹6 convenience fee lost)
- Organizer owes platform: ₹50 (cancel charge only)
- Platform net: keeps commission + ₹30 (convenience) + ₹50 (cancel charge) = ₹80

#### Feature: Organizer Settlement Dues section

A new section on the organizer dashboard showing the running balance the organizer owes the platform:

- **Total dues** = sum of all unpaid convenience_fee liabilities + cancellation charges + postponement charges
- **Per-event breakdown** — each cancelled/postponed event with its charge details
- **Payment status** per event: `PENDING`, `PARTIALLY_PAID`, `SETTLED`
- **Admin settlement** — admin can mark dues as settled after receiving a bank transfer
- **Ledger trail** — every adjustment is recorded in `payment_ledger` with type `ADJUSTMENT`
- **Organizer can see**: total dues, breakdown by event, history of settlements
- **Admin can see**: all organizers' dues, mark as settled, filter by status

#### Implementation plan (post-launch)

1. **Schema:**
   - Add `convenience_fee_bearer` column to `events` table (enum: `ORGANIZER`, `USER`, default `ORGANIZER`)
   - Or make it a per-cancellation choice stored on the event at cancellation time
   - Add `settlement_dues` table or use `payment_ledger` with `ADJUSTMENT` type (already exists)
   - Add `settlement_status` to track payment of dues

2. **Cancellation flow:**
   - Cancel modal shows a toggle: "Who bears the convenience fee? [Organizer / User]"
   - `cancel_event` RPC accepts `p_convenience_fee_bearer` parameter
   - If `ORGANIZER`: refund full total_paise, record convenience_fee as organizer liability
   - If `USER`: refund subtotal_paise only, platform keeps convenience_fee

3. **Postponement refund flow:**
   - When user requests refund, check the event's `convenience_fee_bearer` setting
   - If `ORGANIZER`: refund full total_paise
   - If `USER`: refund subtotal_paise only

4. **Settlement Dues UI:**
   - Organizer dashboard: new "Settlement Dues" card showing total owed
   - Click → detailed breakdown page per event
   - Admin: "Organizer Dues" management page with settle/mark-paid actions

5. **Notifications:**
   - Notify buyer of refund amount and whether convenience fee was deducted
   - Notify organizer of updated dues balance after each cancellation/postponement

### Low Priority
- [x] **Branded Loading Animation** — Neon-gradient spinner (`BrandedLoader`) on all route loading states.
- [ ] **3-Month Data Retention / Archival** — Archive old data, preserve financial/legal records.
- [ ] **Media Cleanup** — Reference-aware cleanup of orphaned files.
- [ ] **RBAC** — Role-based access control beyond current admin/organizer/user. (Co-organizer permission levels implemented as a lightweight version.)
- [ ] **Automated Organizer Settlements** — Payout calculation and processing.
- [ ] **Advanced Analytics** — Recommendation/personalization, advanced reporting.
- [ ] **Push Notifications** — Browser push for event reminders.

---

## 20. Product Vision Roadmap (from PRODUCT_VISION.md)

> These are forward-looking pointers derived from the product vision document. They are NOT implementation tasks yet — they exist so we don't lose sight of the long-term direction. Each will be broken into concrete tasks when prioritized.

### Scene Graph — Connecting Everything (Vision §5)
- [ ] **V1. Scene Graph Data Model** — Schema for linking People ↔ Crews ↔ Places ↔ Experiences ↔ Content. Every object should be able to connect to every other object. This is the long-term moat.
- [ ] **V2. Experience Types Beyond Events** — Support Cyphers, Sessions, Battles, Jams, Challenges, Meetups, Workshops, Open Mics as first-class experience types (not just "events" with tags). Each type can have different participation mechanics.

### People & Identity (Vision §7.1, §11)
- [ ] **V3. People Profiles (Artists/Riders/Creators)** — Beyond user profiles: dedicated profiles for artists, rappers, DJs, breakers, skaters, BMX riders, photographers, videographers. Reputation built through participation, not follower count.
- [ ] **V4. Outsider Score / Reputation System** — Participation-based scoring (cyphers attended, battles entered, sessions joined, clips uploaded). Achievements/badges (Cypher Winner, Battle Veteran, Street Regular, Crew Leader, Local OG, Session Streak). Level system displayed on profile.

### Crews — Deeper (Vision §7.2)
- [ ] **V5. Crew vs Crew Experiences** — Crew-based battles, crew-based jams, crew rankings. Crews as first-class experience participants, not just organizers.
- [ ] **V6. Crew Content & History** — Crews can publish content, build a timeline/history, showcase members, link to past experiences.

### Places — Living Map (Vision §7.3, §9 removed)
- [ ] **V7. Places as First-Class Objects** — Skate spots, BMX spots, graffiti walls, parks, studios, underground spaces. Not just venues — places have sessions, people, crews, photos, videos, activity history.
- [ ] **V8. Place Discovery** — Browse places by category, city, activity level. See what's happening at a place, recent clips, active crews, upcoming sessions.

### Content — Scene Feed (Vision §10)
- [ ] **V9. Culture Feed** — NOT a generic social feed. Content answers "What is happening in the scene?" — new tricks landed, battles won, spots discovered, clips from last night. Content must be connected to people, places, crews, experiences.
- [ ] **V10. Experience-Linked Content** — Photos and clips attached to experiences. After an event, the experience page shows community-uploaded content. Post-event content keeps the experience alive.
- [ ] **V11. Clip Upload** — Short video clips from sessions, battles, cyphers. Linked to people, places, crews, experiences.
- [ ] **V11a. Video in Event Gallery** — Allow organizers to add video URLs (YouTube/Instagram Reel embeds) alongside photos in the event gallery. Lightweight approach — no direct video file uploads, just URL embeds. Direct video file uploads deferred to Phase 2 with media processing pipeline (compression, thumbnails, CDN).
- [ ] **V11b. Video Event Cards** — Allow video as card/banner poster (instead of static image). Requires video thumbnail generation (server-side FFmpeg or first-frame extraction), aspect ratio matching (4:5 card, 16:9 banner), and CDN delivery for performance. Phase 2 — needs media processing pipeline first.

### Home Screen — Scene Discovery (Vision §12)
- [ ] **V12. Scene-Based Home Screen** — Replace event-catalog home with scene discovery: "Happening Now", "Your Scene" (based on follows/interests), "From the Streets" (clips), "Around You" (nearby sessions), "Battles" (open spots), "Your Crew" (crew activity). Feel like entering the local underground, not browsing a catalog.
- [ ] **V13. "Happening Now" Section** — Real-time or near-real-time view of experiences happening right now in the user's city. Distance-aware.

### Organizer Identity Model (Vision §14)
- [ ] **V14. Organizer Identity Types** — Beyond generic "organizer": Crew, Artist, Athlete, Venue, Community, Brand. Each identity type can have different capabilities and profile layout.

### Outsiderr Originals (Vision §15)
- [ ] **V15. Outsiderr Originals Framework** — Platform-created experiences: Block Cypher, Street Jam, Night Ride, Outsiderr Battle. Branded multi-discipline events. Path from "platform for the scene" to "brand that shapes the scene."

### Battles & Competitions (Vision §7.4)
- [ ] **V16. Battle Mechanics** — Registration, brackets, participant vs spectator roles, live voting, results recording, winner showcase. Battles as a distinct experience type with its own flow.
- [ ] **V17. Challenge System** — User-created challenges (trick challenges, rap challenges, dance challenges). Open submission, community voting, leaderboard.

### Follow & Connect (Vision §13)
- [ ] **V18. Follow System** — Follow artists, riders, crews, organizers, places. Feed of followed entities' activity. Already deferred as P55 — this is the broader vision version that includes places and content, not just organizers.
- [ ] **V19. Participation History** — User profile shows timeline of experiences attended, crews joined, clips uploaded, battles entered. Identity built through participation.

### Business Model — Beyond Ticket Commission (Vision §16)
- [ ] **V20. Sponsorship/Brand Campaign Framework** — Brand sponsorships, brand activations, sponsored experiences. Campaign management for brands wanting to reach the underground community.
- [ ] **V21. Merchandise & Drops** — Limited drops tied to crews, experiences, or Outsiderr Originals. Merchandise for organizers/crews.
- [ ] **V22. Premium Organizer Tools** — SaaS-tier organizer features: advanced analytics, CRM, marketing tools, crew management. Subscription-based.

### Cultural Categories (Vision §6)
- [ ] **V23. Narrow Category Focus** — Keep categories intentionally narrow: Hip-Hop (Rap, Freestyle, DJing, Breaking, Beatboxing, Graffiti, Beat battles, Rap battles) + Street/Extreme Sports (Skateboarding, BMX, Parkour, Freerunning, Roller/inline, Street basketball). Do NOT add mainstream categories just for market size. Authenticity over scale.

---

## 21. Recommended Development Order

### PHASE 1 — Core launch (P0)
1. [x] Platform settings table
2. [ ] Custom domain + Vercel
3. [ ] Phone + OTP authentication
4. [x] Event creation
5. [x] Organizer T&C acceptance (versioned)
6. [x] Venue announcement system (TBA mode + Maps validation)
7. [ ] Razorpay integration
8. [x] Booking system (manual UPI)
9. [ ] Payment verification (Razorpay)
10. [x] Ticket generation
11. [x] Refund engine (basic — manual UPI; auto-refunds need Razorpay)
12. [x] Event cancellation (with configurable charges)
13. [x] Event postponement (with configurable charges)
14. [ ] Basic notification system
15. [ ] Email/SMS/WhatsApp integration
16. [x] Basic admin dashboard
17. [x] Legal/policy pages (database-backed, admin CRUD, public routes)

### PHASE 2 — Launch enhancements (P1)
18. [x] Door staff (pricing, UPI payment, UTR submission, per-event scanner)
19. [ ] Online events
20. [ ] Advanced notifications
21. [ ] Event analytics (views + conversion)
22. [x] Organizer analytics (per-event + aggregate dashboard with 30-day revenue trend)
23. [x] Event boosting — slot-based (manual UPI)
24. [x] Hero/Featured Event Boosting V1 (rotation, eligibility, organizer + admin UI, homepage carousel)
25. [x] Admin policy management (legal pages CRUD)
26. [ ] Scheduled jobs
27. [ ] Payment reconciliation
28. [ ] Payment webhook hardening
29. [x] Organizer KYC / banking onboarding (PAN, GST, bank details, 5-step wizard)
30. [x] List Your Event landing page
31. [x] Past events handling (excluded from active sections, read-only)
32. [x] Expandable ticket cards with expired state
33. [x] Platform footer (social, quick links, legal, consent notice)
34. [x] Dynamic platform commission from admin settings
35. [x] Admin-configurable taglines

### PHASE 3 — Scale & optimization (P2)
29. [ ] RBAC
30. [ ] Automated data archival
31. [ ] Media lifecycle management
32. [ ] Automated organizer settlements
33. [ ] Advanced analytics
34. [ ] Push notifications
35. [ ] Recommendation/personalization
36. [ ] Advanced reporting

---

## 22. Engineering Hardening & Reliability

> Added after architecture review. These items make the app robust, consistent, reliable, and highly available. Ordered by impact.

### Error Tracking & Observability
- [x] **E1. Sentry Integration** — `@sentry/nextjs` added. Client, server, and edge configs created. Error boundaries report to Sentry. Source map upload on build. Silently no-ops if `SENTRY_DSN` is not set. Env vars added to `.env.example`.
- [x] **E2. Structured Logging** — `src/lib/logger.ts` with pino. JSON to stdout in production, pino-pretty in dev. Auto-redacts secrets (passwords, tokens, signatures, auth headers). `logError()` helper also reports to Sentry. Applied to Razorpay webhook, cron expire-reservations, and admin actions (refund, payout, event status, order approve/reject). Remaining `console.*` calls in non-critical paths can be migrated incrementally.

### Input Validation
- [x] **E3. Zod Input Validation** — `src/lib/validation.ts` with schemas for PINs, box-office orders, check-in, event, tiers, profiles. Applied to all box-office, scanner, check-in, and walk-in server actions. 35 validation tests passing.

### Idempotency & Data Consistency
- [x] **E4. Idempotency for Box-Office Orders** — `orders.idempotency_key` column added with unique index. `create_walkin_order` RPC accepts `p_idempotency_key` and returns existing order if key matches. Server actions generate `crypto.randomUUID()` per order. Migration applied to live DB.
- [x] **E5. Idempotency for Check-In** — `check_in_ticket_with_pin` and `check_in_ticket` return `ALREADY_USED` for duplicate scans — this is naturally idempotent. The offline sync manager (`src/lib/offline/sync-manager.ts`) treats `ALREADY_USED` as a successful sync, records it in history, and removes the scan from the queue. Documented in code comments.

### Security
- [x] **E6. Hash PINs** — `pin_hash` column added to `scanner_pins` and `box_office_pins`. SHA-256 of `event_id:pin_code` stored. Verify RPCs hash input and compare. Generate RPCs store hash alongside plaintext (for organizer display). Unique index moved to `pin_hash`. Migration applied to live DB.
- [x] **E7. Rate Limiting** — `src/lib/rate-limit.ts` with in-memory sliding window. Applied to PIN verification (20/min), box-office orders (10/min), check-in (60/min). Per-IP via `x-forwarded-for`. Presets for login and API routes.


### Testing
- [x] **E8. Automated Test Suite** — Vitest installed. 64 tests across 3 suites: validation (35), rate limiting (10), financial calculations (19). `npm test` runs all. Financial tests verify the canonical 10×₹450 example and invariants (organizer payout + commission = subtotal, buyer total = subtotal + convenience fee).
- [x] **E9. Test Fixtures & Seed Data** — `tests/fixtures.ts` with deterministic UUIDs and in-memory data for 3 users, 1 organizer, 3 events (free/paid/sold-out), 4 tiers, 2 orders (online + box-office), 2 tickets (VALID + USED), 2 PINs. `scripts/seed-test-data.mjs` inserts fixtures into a test DB with hashed PINs. 38 fixture integrity tests verify data relationships, financial accuracy, inventory state, ticket state, PIN state, and event lifecycle. Total: 102 tests across 4 suites.

### UX Safety Nets
- [x] **E10. 404 Page** — `src/app/not-found.tsx` added with branded 404 matching the glass-card style.

### Environment & Deployment
- [ ] **E11. Staging Environment** — Separate Supabase project + Vercel preview deployment for testing before production. See "Staging Setup Steps" below.
- [x] **E12. Database Backup Automation** — Code-based backup via `src/lib/backup.ts`. Exports 23 critical tables as JSON, gzip-compresses, uploads to private `backups` Supabase Storage bucket. Cron routes at `/api/cron/backup?type=daily` (2 AM daily, keep 7) and `?type=weekly` (3 AM Sundays, keep 4). Rolling retention auto-deletes old backups. Restore via `scripts/_restore_backup.mjs`. Bucket creation script: `scripts/_apply_backup_bucket.mjs`. No Supabase Pro required — uses Storage free tier. Schema updated in `supabase/schema.sql` + `supabase/migrations/fix_all.sql`.

### Performance
- [x] **E13. Cache Public Pages** — Home page uses `revalidate = 60` (ISR). Event detail pages remain dynamic with `revalidate = 0`. Event mutations call `revalidateTag("events")` alongside `revalidatePath("/")` for immediate cache busting. Booking still checks authoritative inventory in the RPC — cached listings never determine booking eligibility.

---

## 23. Staging Setup Steps

> These steps require manual actions in the Supabase and Vercel dashboards. They cannot be fully automated.

### Step 1 — Create a Staging Supabase Project
1. Go to https://supabase.com/dashboard → New Project
2. Name it `outsiderr-staging` (or similar)
3. Choose the same region as production (ap-southeast-1)
4. Set a strong database password
5. Wait for provisioning (~2 minutes)

### Step 2 — Apply Schema to Staging
1. Open the SQL Editor in the staging project
2. Run `supabase/schema.sql` (the full canonical schema)
3. Run `supabase/migrations/fix_all.sql` (incremental fixes)
4. Verify all tables and RPCs exist

### Step 3 — Seed Staging Data
1. Run `scripts/reseed.mjs` against the staging database (update the connection string)
2. Or manually create a test event, tier, organizer, and a few orders

### Step 4 — Create Vercel Preview Deployment
1. In Vercel, your project already has preview deployments for every PR
2. Go to Project Settings → Environment Variables
3. Add a "Preview" environment for all Supabase + Razorpay keys, pointing to the staging Supabase project
4. Use test-mode Razorpay keys for staging (Razorpay provides test key IDs starting with `rzp_test_`)

### Step 5 — Configure Razorpay Test Webhook
1. In the Razorpay dashboard, create a test webhook
2. URL: your Vercel preview URL + `/api/razorpay/webhook`
3. Subscribe to the same events as production
4. Use the test webhook secret in your staging env vars

### Step 6 — Configure Cron for Staging
1. In Vercel, add a cron job for the preview deployment calling `/api/cron/expire-reservations`
2. Use a separate `CRON_SECRET` for staging

### Step 7 — Verify
1. Open the preview deployment URL
2. Create a test event, book a ticket, scan it, create a box-office order
3. Verify all flows work against the staging database
4. Verify Razorpay test payment works end-to-end

### Step 8 — Document
1. Add staging env vars to `.env.example` with `_STAGING` suffix
2. Document the promote-to-production process: merge PR → main → Vercel auto-deploys to production → run any new migrations on production Supabase
