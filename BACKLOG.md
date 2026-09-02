# Outsiderr — Product Backlog & Progress Tracker

## Purpose

This document tracks all product, engineering, infrastructure, payment, organizer, admin, notification, legal, analytics, and branding work for **Outsiderr**.

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
- [x] **P29. Profile Menu — Dynamic Organizer Label** — Shows "Become an Organizer" for non-organizers and "Organize Events" for organizers. Organizer status checked in navbar and passed to user menu.

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

- [x] **P15. Centralized Admin Dashboard** — Overview, events, orders, boosts, hero boosts, clubs, users, door staff, settings, legal pages. Admin overview stats include both slot + hero boost counts. Pending hero boost alert banner. RBAC deferred.
- [x] Admin settings page (`/admin/settings`) — saves in both demo and Supabase mode with success indicator.
- [x] Admin door staff page (`/admin/door-staff`)
- [x] Admin hero boosts page (`/admin/hero-boosts`) — summary cards, full boost list, verify/activate/reject/cancel actions. Cross-linked to slot boosts page.
- [x] Admin legal pages page (`/admin/legal`) — CRUD for database-backed legal pages.
- [x] Admin users page — shows multiple demo users (not collapsed to one).
- [x] Admin boosts page (`/admin/boosts`) — approve/reject slot-based boosts. Cross-linked to hero boosts page.
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

- [ ] **P21. Outsiderr Logo** — Primary, horizontal, icon, light/dark versions, social media, app icon.
- [~] **P22. Loading / Buffering Animation** — Loading skeletons added. Branded animation deferred.
- [x] **P34. Profile Dropdown UX** — Auto-close on navigation and outside click. Fixed z-index overlay (z-40 overlay, z-50 menu). Dark-mode mobile styling fixed.
- [x] **P35. Post-Payment Success UI** — Green confirmation message + WhatsApp instructions for UTR submission on checkout and tickets pages.
- [x] **P37. Leaflet SSR Fix** — MapPicker changed from `React.lazy()` to `next/dynamic` with `ssr: false` in both event-form and edit-event-form. Fixes `window is not defined` error on `/organizer/events/[id]`.
- [x] **P38. Hero Boost Error Handling** — Supabase errors (PostgrestError) now properly extracted in all hero boost actions. Added `console.error` logging. `getHeroBoostForEvent` and `getHeroEvents` catch errors gracefully instead of crashing pages.
- [x] **P39. Admin/Hero Boost Sync** — Admin overview stats now include hero boost counts (active + pending). Pending hero boost alert banner on admin overview with link to `/admin/hero-boosts`. Cross-links between Slot Boosts and Hero Boosts admin pages.
- [x] **P40. Standalone Hero Boosts Migration** — Created `supabase/migrations/hero_boosts.sql` with table creation, settings inserts, indexes, and RLS policies for easy one-shot execution in Supabase SQL Editor.

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

### Organizer
- [x] Organizer profile creation (become-organizer form)
- [x] Organizer profile editing (name, bio, photo, UPI ID with validation + QR preview)
- [x] Organizer T&C versioning (terms_version + accepted_at)
- [x] UPI ID validation + QR code generation
- [x] Dynamic organizer heading on dashboard (name, avatar, bio, verified badge)
- [x] Public organizer profile page (`/organizers/[id]`)
- [x] "Become an Organizer" / "Organize Events" dynamic label in profile menu
- [x] Back to dashboard button on event management pages

### Booking & Tickets
- [x] Booking system (manual UPI + UTR)
- [x] Ticket generation with QR codes
- [x] Ticket wallet (`/tickets`)
- [x] RSVP form with email/gender (optional)
- [x] Share event button (Web Share API + clipboard fallback, dynamic origin URLs)
- [x] Print report (window.print in client component)
- [x] Door scanner (html5-qrcode, lazy loaded, organizer-only, per-event validation, cooldown)
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
- [x] Centralized admin dashboard (overview, events, orders, boosts, hero boosts, clubs, users, door staff, settings, legal)
- [x] Admin settings page (saves in demo + Supabase, success indicator)
- [x] Admin door staff management page
- [x] Admin hero boosts management page (verify/activate/cancel, summary cards)
- [x] Admin overview includes hero boost stats + pending alert banner
- [x] Admin legal pages CRUD
- [x] Admin users page (multiple demo users tracked separately)
- [x] Admin boosts page (approve/reject slot-based boosts)
- [x] Cross-links between Slot Boosts and Hero Boosts admin pages

### Door Staff
- [x] Door staff tiered pricing from settings
- [x] Door staff order creation + UPI QR payment + UTR submission
- [x] Door staff availability count in admin settings
- [x] Door staff request from event management page
- [x] Door scanner removed from user profile menu (organizer-only)

### Legal & Info Pages
- [x] Database-backed legal pages (Terms, Refund, Cancellation, Privacy, etc.)
- [x] Admin legal pages CRUD at `/admin/legal`
- [x] Public legal pages at `/legal/[slug]`
- [x] About Us page (`/about`)
- [x] Contact Us page (`/contact`)

### Platform & Infrastructure
- [x] Platform settings table + admin settings page
- [x] Demo mode with process-local store (events, orders, tickets, waitlist, boosts, clubs, clubMembers, doorStaffOrders, platformSettings, users, legalPages, heroBoosts)
- [x] PWA support (manifest, service worker, icons)
- [x] Loading skeletons
- [x] Profile dropdown UX (auto-close, dark-mode mobile, z-index)
- [x] Leaflet SSR fix (next/dynamic ssr:false instead of React.lazy)
- [x] Hero boost error handling (Supabase error extraction, graceful degradation)
- [x] Admin/hero boost sync (overview stats include hero boosts, pending alert banner, cross-links)
- [x] Standalone hero_boosts migration SQL file (`supabase/migrations/hero_boosts.sql`)

---

## 17. Known Issues & Action Required

- [ ] **Run `supabase/migrations/hero_boosts.sql`** in Supabase SQL Editor — The `hero_boosts` table, `contact_email`/`contact_phone` columns, and hero platform settings must be created in your Supabase project. Without this, Hero Boost purchases will fail with a database error.
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
- [ ] **Outsiderr Logo** — Full brand asset set.
- [ ] **Branded Loading Animation** — Custom animation replacing skeletons.
- [ ] **3-Month Data Retention / Archival** — Archive old data, preserve financial/legal records.
- [ ] **Media Cleanup** — Reference-aware cleanup of orphaned files.
- [ ] **RBAC** — Role-based access control beyond current admin/organizer/user.
- [ ] **Automated Organizer Settlements** — Payout calculation and processing.
- [ ] **Advanced Analytics** — Recommendation/personalization, advanced reporting.
- [ ] **Push Notifications** — Browser push for event reminders.

---

## 19. Recommended Development Order

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
18. [x] Door staff (pricing, UPI payment, UTR submission, scanner)
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

### PHASE 3 — Scale & optimization (P2)
29. [ ] RBAC
30. [ ] Automated data archival
31. [ ] Media lifecycle management
32. [ ] Automated organizer settlements
33. [ ] Advanced analytics
34. [ ] Push notifications
35. [ ] Recommendation/personalization
36. [ ] Advanced reporting
