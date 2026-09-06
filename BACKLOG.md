# Outsiderr — Product Backlog & Progress Tracker

## Purpose

This document tracks all product, engineering, infrastructure, payment, organizer, admin, notification, legal, analytics, and branding work for **Outsiderr**.

> **Read `PRODUCT_VISION.md` first.** Every feature decision must align with the product vision. If a proposed feature makes Outsiderr look more like a generic ticketing platform, question it. The vision is the north star — the backlog is the execution plan.

## Status markers

- `[x]` — Done
- `[~]` — In progress / partially done
- `[ ]` — Not started

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
- [ ] **P56. Organizer Rating** — Users can rate organizers (1-5 stars). Average rating displayed on organizer profile. (Deferred)

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
- [~] **P22. Loading / Buffering Animation** — Loading skeletons added. Branded animation deferred.
- [x] **P34. Profile Dropdown UX** — Auto-close on navigation and outside click. Fixed z-index overlay (z-40 overlay, z-50 menu). Dark-mode mobile styling fixed.
- [x] **P35. Post-Payment Success UI** — Green confirmation message + WhatsApp instructions for UTR submission on checkout and tickets pages.
- [x] **P37. Leaflet SSR Fix** — MapPicker changed from `React.lazy()` to `next/dynamic` with `ssr: false` in both event-form and edit-event-form. Fixes `window is not defined` error on `/organizer/events/[id]`.
- [x] **P38. Hero Boost Error Handling** — Supabase errors (PostgrestError) now properly extracted in all hero boost actions. Added `console.error` logging. `getHeroBoostForEvent` and `getHeroEvents` catch errors gracefully instead of crashing pages.
- [x] **P39. Admin/Hero Boost Sync** — Admin overview stats now include hero boost counts (active + pending). Pending hero boost alert banner on admin overview with link to `/admin/hero-boosts`. Cross-links between Slot Boosts and Hero Boosts admin pages.
- [x] **P40. Standalone Hero Boosts Migration** — Created `supabase/migrations/hero_boosts.sql` with table creation, settings inserts, indexes, and RLS policies for easy one-shot execution in Supabase SQL Editor.
- [x] **P41. Organizer KYC / Banking Onboarding** — 5-step wizard collecting PAN, GST (optional), bank account, UPI, and organizer agreement. Schema extended with `pan_number`, `pan_name`, `gst_number`, `gst_business_name`, `bank_account_number`, `bank_ifsc`, `bank_account_name`, `bank_account_type`, `kyc_submitted` columns. PAN format (`ABCDE1234F`) and IFSC format (`ABCD0123456`) validated server-side.
- [x] **P42. List Your Event Landing Page** — Marketing page at `/list-your-event` with hero, stats, how-it-works, feature cards, category chips, and CTA. "Get Started" routes to `/organizer`. Navbar "List your event" link removed; access via profile menu and footer.
- [x] **P43. Per-Event Door Scanner** — Scanner moved from universal (`/organizer/scan`) to per-event (`/organizer/events/[id]/scan`). Validates both ticket authenticity and event ID match. Door scanner button removed from organizer dashboard header; only visible on individual event management pages.
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
- [~] **P27. Organizer Analytics** — Per-event analytics (orders, revenue, payout, check-ins, waitlist). Aggregate dashboard + views/conversion deferred.
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
- [ ] **Run `supabase/migrations/wipe_all.sql`** if you want a clean reset — now includes commission tier seeds and auto-promote first admin trigger.
- [ ] **Set `NEXT_PUBLIC_PLATFORM_UPI_ID`** env var — Required for the UPI QR code displayed in the Hero Boost payment panel.

---

## 18. Remaining Work (Not Started)

### High Priority
- [ ] **Razorpay Integration** — Server-side order creation, Checkout, payment verification, webhook handling, auto-refunds.
- [ ] **Custom Domain + Vercel** — DNS, SSL, HTTPS, redirect strategy.
- [ ] **Phone + OTP Authentication** — Replace email/password with phone OTP.
- [ ] **Central Notification Infrastructure** — Common `sendNotification(user, type, data)` abstraction.
- [ ] **SMS / Email / WhatsApp Integration** — Provider integrations behind common interfaces.

### Medium Priority
- [ ] **Online Event Support** — Physical vs Online toggle, meeting platform, meeting URL.
- [ ] **Guest Checkout / OTP Checkout** — Prefill profile for logged-in users.
- [ ] **Event Analytics** — Views, unique visitors, conversion rate, sales over time.
- [ ] **Organizer Analytics (Aggregate)** — Cross-event dashboard, views/conversion.
- [ ] **Scheduled Jobs / Cron** — Venue reminders, event reminders, boost expiry job, media cleanup, refund checks.
- [ ] **Payment Webhook Infrastructure** — Razorpay webhook endpoint.
- [ ] **Admin Analytics** — DAU/MAU/trends.
- [ ] **Audit Log Table** — Track important admin/organizer actions.

### Low Priority
- [ ] **Branded Loading Animation** — Custom animation replacing skeletons.
- [ ] **3-Month Data Retention / Archival** — Archive old data, preserve financial/legal records.
- [ ] **Media Cleanup** — Reference-aware cleanup of orphaned files.
- [ ] **RBAC** — Role-based access control beyond current admin/organizer/user.
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
22. [~] Organizer analytics (per-event done, aggregate deferred)
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
