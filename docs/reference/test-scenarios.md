# Outsiderr — Manual Test Scenarios

> Complete end-to-end test plan for all completed features. Run these against a staging or local dev environment with a real Supabase backend.

## Prerequisites

*   Two organizer accounts (Organizer A = primary owner, Organizer B = co-organizer)
*   One regular user account (User C = ticket buyer / subscriber / follower)
*   One admin account
*   Supabase migrations applied (`fix_all.sql` run)
*   `.env` configured with Supabase credentials

 *

## 1\. Authentication & User Profile

### 1.1 Registration & Login

- [ ] Register a new user with email + password
- [ ] Verify redirect to home page after registration
- [ ] Log out, log back in
- [ ] Verify “My Profile” link appears in navbar user menu
- [ ] Verify “List Your Event” label shows for non-organizers
- [ ] Verify “Manage Your Events” label shows for organizers

### 1.2 User Profile

- [ ] Navigate to `/profile`
- [ ] Edit name, birthdate, phone
- [ ] Select interested-in tags from the chip picker
- [ ] Save and verify changes persist on reload
- [ ] Book an event → verify event tags auto-merge into interested-in tags

 *

## 2\. Organizer Onboarding

### 2.1 Become an Organizer

- [ ] Click “List Your Event” in profile menu → lands on `/list-your-event`
- [ ] Click “Get Started” → redirects to `/organizer`
- [ ] Fill become-organizer form (name, bio, photo, cover photo, UPI ID)
- [ ] Verify UPI ID validation (accepts `name@upi`, rejects invalid formats)
- [ ] Verify QR code generates from UPI ID
- [ ] Submit → verify organizer profile created
- [ ] Verify dashboard shows cover banner + avatar + name + bio

### 2.2 KYC Onboarding (5-step wizard)

- [ ] Navigate to organizer verification flow
- [ ] Step 1: Profile details
- [ ] Step 2: PAN number (validate format `ABCDE1234F`) + optional PAN card photo (JPG/PNG under 1 MB — oversized file shows error, doesn't upload)
- [ ] Step 3: GST (optional — skip should work)
- [ ] Step 4: Bank account + IFSC (validate format `ABCD0123456`) + optional bank proof (cancelled cheque/passbook, under 1 MB)
- [ ] Step 5: Agreement acceptance
- [ ] Verify all KYC fields saved to organizer profile (incl. `pan_document_url` / `bank_document_url`)

### 2.3 KYC Review States

- [ ] While PENDING → dashboard shows "Organizer verification in progress" (amber)
- [ ] Admin rejects → bell gets "Application Rejected" notification live (no reload) + page refreshes to red "application not approved" panel
- [ ] Admin requests clarification → "Clarification Needed" notification + blue banner
- [ ] Admin approves → "Organizer Verified!" notification + dashboard unlocks
- [ ] Organizer replies + re-uploads docs → "Submit response" persists `kyc_response_note` + doc URLs (verify in admin review card)
- [ ] Resubmit → `kyc_status` back to PENDING
- [ ] "Withdraw application" → confirm → organizers row deleted + `is_organizer=false` → lands on become-organizer form
- [ ] Withdrawal blocked if APPROVED or if events exist (error message shown)

### 2.3b Rejection Limit & Menu States

- [ ] REJECTED (any count) → navbar + footer show "List Your Event", NOT "Organizer Dashboard"
- [ ] Only APPROVED organizers see "Organizer Dashboard" in user menu
- [ ] Rejected below limit → `/list-your-event` still shows "Get Started" (→ resubmit panel)
- [ ] Rejection count reaches `organizer_rejection_limit` (platform_settings, default 5) → `/list-your-event` shows "application rejected N times — contact support" instead of CTAs
- [ ] Blocked user visiting `/organizer` directly → "Organizer access blocked" panel (no wizard, no dashboard)
- [ ] Change `organizer_rejection_limit` in platform_settings → block threshold updates accordingly

### 2.4 Admin Notifications (pending-review queues)

- [ ] New organizer submits KYC → every admin's bell shows "KYC Submitted" live
- [ ] Organizer resubmits after rejection → admins notified again
- [ ] Organizer requests a boost slot → "Boost Request" notification to admins (₹ + UTR in message)
- [ ] Organizer submits hero-boost UTR → "Boost Request" notification to admins
- [ ] Organizer submits door-staff payment UTR → "Door Staff Payment" notification to admins

### 2.3 Organizer Profile Edit

- [ ] Edit name, bio, photo, cover photo, UPI ID
- [ ] Verify QR preview updates when UPI ID changes
- [ ] Save and verify changes persist

 *

## 3\. Event Creation

### 3.1 Basic Event Creation

- [ ] Navigate to `/organizer?tab=create`
- [ ] Fill event title, description
- [ ] Select category — verify “Alternate Sports & Fitness” appears (renamed from Fitness)
- [ ] Select “Gaming” category — verify it appears in the dropdown
- [ ] Select city, venue name
- [ ] Use map picker to set location
- [ ] Add Google Maps link — verify validation
- [ ] Add organizer contact email + phone
- [ ] Set start/end date and time
- [ ] Verify Poster & Description Guidelines panel is collapsible
- [ ] Upload card poster (3:4 ratio, verify 1.5 MB max, .png/.jpg only)
- [ ] Upload banner poster (16:9 ratio)
- [ ] Add gallery photos (up to 8, via upload or URL)
- [ ] Accept organizer T&C
- [ ] Save as draft → verify event appears in “Drafts” tab
- [ ] Publish event → verify event appears in “Published” tab

### 3.2 Pricing Modes

- [ ] Create FREE event → verify no price fields
- [ ] Create FLAT pricing event → verify single price field
- [ ] Create PAID event with multiple tiers → verify tier add/remove works
- [ ] Verify tier validation: name ≥2 chars, price ≥₹1, quantity ≥1
- [ ] Verify dirty state tracking (unsaved changes warning)

### 3.3 Time-Based Phased Flat Pricing

- [ ] Create event with phased pricing (Early Bird → Phase 2 → Normal)
- [ ] Set per-phase ticket allocation
- [ ] Set phase open/close dates
- [ ] Verify automatic carry-forward of unsold tickets
- [ ] Verify active phase shown on public event page
- [ ] Verify phase timeline shown on public event page

### 3.4 Venue TBA Mode

- [ ] Select “To Be Announced” radio in event form
- [ ] Verify venue fields hide when TBA selected
- [ ] Save and verify “TBA” shown on public event page

### 3.5 Linked Past Events

- [ ] Create a new event
- [ ] Link a past event as “previous edition”
- [ ] Verify linked event shows on public event page with aggregate rating

### 3.6 Gaming Category Tags

- [ ] Create event with “Gaming” category
- [ ] Verify gaming tags appear (Esports, LAN Tournament, FIFA, BGMI, Valorant, etc.)
- [ ] Select gaming tags → verify they save with the event
- [ ] Verify tags display on event card and event page

### 3.7 Teaser Video (optional)

- [ ] Upload a ≤10s MP4/WebM → preview shows, URL fills, saves to `events.teaser_video_url`
- [ ] Try a video > 10s → rejected with a clear message before upload
- [ ] Try a video > 50 MB → rejected with a clear message
- [ ] Leave it empty → event saves fine, card shows the photo (teaser is optional)
- [ ] Same field on **edit** — replace/remove the teaser and verify it persists

### 3.8 Poster Crop Tool

- [ ] Upload a Card poster → crop modal opens locked to **3:4** → drag to center + zoom → Apply → uploads cropped JPEG
- [ ] Upload a Banner poster → crop modal locked to **16:9**
- [ ] Cancel the crop → nothing uploads, field stays empty
- [ ] Re-select the same file → cropper re-opens
- [ ] Crop a very large source → cropped output still respects the 1.5 MB limit (or a size error shows)
- [ ] "or paste an image URL" still works as a no-crop fallback
- [ ] Same crop behavior on the **edit** form

 *

## 4\. Event Discovery (Public Pages)

### 4.1 Homepage

- [ ] Verify branded loading spinner appears on route navigation
- [ ] Verify dynamic tagline header from admin settings
- [ ] Verify Hero Carousel rotates (if hero boosts active)
- [ ] Verify Featured Events section
- [ ] Verify Happening Today section
- [ ] Verify Popular Events section
- [ ] Verify All Events section
- [ ] Verify Past Events section (at bottom, disabled cards, “Completed” badge)
- [ ] Verify category filter chips include “Alternate Sports & Fitness” and “Gaming”
- [ ] Filter by Gaming category → verify only gaming events show
- [ ] Verify event cards use 3:4 aspect ratio for posters

### 4.2 Event Detail Page

- [ ] Click an event → verify detail page loads
- [ ] Verify event title, date/time, venue, city
- [ ] Verify description renders correctly
- [ ] Verify gallery photos display
- [ ] Verify organizer contact (email/phone) with mailto/tel links
- [ ] Verify organizer name links to `/organizers/[id]`
- [ ] Verify co-organizers display (if any accepted collaborators)
- [ ] Verify “Update Me” button appears (for logged-in users, non-past events)
- [ ] Verify share button works (Web Share API or clipboard fallback)
- [ ] Verify ticket tiers display with prices
- [ ] Verify active phase shown for phased pricing events

### 4.3 Organizer Public Profile

- [ ] Navigate to `/organizers/[id]`
- [ ] Verify Facebook-style cover + avatar
- [ ] Verify organizer name, bio, verified badge
- [ ] Verify follower count displayed
- [ ] Verify Follow/Unfollow button works
- [ ] Verify upcoming events section
- [ ] Verify past events section with “Completed” badges
- [ ] Verify reviews + ratings section (if reviews exist)
- [ ] Verify social links (Instagram, YouTube, X, Facebook, LinkedIn)

### 4.4 Teaser Video Card

- [ ] An upcoming event with a teaser → its card autoplays the video **muted** inline when scrolled into view
- [ ] Scroll it out of view → video pauses; scroll back → resumes
- [ ] Tapping the card still opens the event page (no video controls block the link)
- [ ] Poster image shows as the instant/fallback visual before the video buffers
- [ ] A past or cancelled event → photo card only (no video), even if a teaser was set
- [ ] After the event ends, the `cleanup-teasers` cron deletes the file from `event-media` and clears `teaser_video_url`

 *

## 5\. Booking & Tickets

### 5.1 Book a Ticket (Manual UPI)

- [ ] As User C, navigate to a paid event
- [ ] Select ticket tier and quantity
- [ ] Fill RSVP form (email, gender if optional)
- [ ] Verify checkout page shows subtotal + convenience fee + total
- [ ] Verify platform fee percentage matches admin settings
- [ ] Submit UTR reference
- [ ] Verify green success message + WhatsApp instructions
- [ ] Navigate to `/tickets` → verify ticket appears
- [ ] Expand ticket card → verify large QR, event details, download button

### 5.2 Book a Free Ticket

- [ ] Book a free event → verify no payment step
- [ ] Verify ticket generated with QR code
- [ ] Verify ticket appears in `/tickets`

### 5.3 Past Event Booking Guard

- [ ] Navigate to a past event
- [ ] Verify “Event ended” message instead of “Book now” button
- [ ] Verify ticket tiers show expired state

### 5.4 Expired Tickets

- [ ] View a ticket for a past event in `/tickets`
- [ ] Verify ticket is dimmed, grayscale, non-clickable
- [ ] Verify “EXPIRED” stamp over QR
- [ ] Verify “Event Ended” badge

### 5.5 Ticket Wallet

- [ ] Navigate to `/tickets`
- [ ] Verify all tickets listed
- [ ] Click a ticket → verify expandable modal with large QR
- [ ] Verify check-in time displayed (if checked in)
- [ ] Verify download button works

### 5.6 Waitlist & FIFO

- [ ] Sell out a tier → "Join Waitlist" appears → User C joins, gets a position
- [ ] Same user re-joins → returns existing entry (idempotent, no duplicate)
- [ ] Two users join → positions assigned in arrival order (1, 2 …)
- [ ] Free a ticket (organizer rejects/cancels an order) → lowest-position WAITING user gets `WAITLIST_OFFER` notification + 24h `expires_at`
- [ ] OFFERED user books within 24h → order confirms; their waitlist row is cleared (no re-offer later)
- [ ] OFFERED user lets 24h lapse → `expire-waitlist-offers` cron re-queues them to the END and offers the next person
- [ ] Burst join (many users at once) → no two users share a position

 *

## 6\. “Update Me” Event Subscriptions

### 6.1 Subscribe to an Event

- [ ] As User C (not booked), navigate to an event page
- [ ] Click “Update Me” button
- [ ] Verify button changes to “Subscribed” state
- [ ] Reload page → verify subscribed state persists

### 6.2 Unsubscribe

- [ ] Click “Update Me” again (now shows Subscribed)
- [ ] Verify button reverts to “Update Me”
- [ ] Reload → verify unsubscribed state persists

### 6.3 Notification on Event Change

- [ ] As User C, subscribe to an event
- [ ] As Organizer A, edit the event (change venue)
- [ ] As User C, check notification bell → verify VENUE\_CHANGE notification appears
- [ ] As Organizer A, change the city → verify CITY\_CHANGE notification
- [ ] As Organizer A, change the time → verify TIME\_CHANGE notification
- [ ] Verify price-only change does NOT trigger TIME\_CHANGE notification

### 6.4 Subscribers + Ticket Holders Both Notified

- [ ] User C subscribes (no ticket)
- [ ] User D books a ticket
- [ ] Organizer changes venue
- [ ] Verify both User C and User D receive the notification

 *

## 7\. Follow / Unfollow Organizers

### 7.1 Follow

- [ ] As User C, navigate to `/organizers/[id]`
- [ ] Click “Follow” button
- [ ] Verify follower count increments
- [ ] Verify button changes to “Following”

### 7.2 Unfollow

- [ ] Click “Following” button
- [ ] Verify follower count decrements
- [ ] Verify button changes back to “Follow”

### 7.3 Persistence

- [ ] Reload page → verify follow state persists
- [ ] Log out, log back in → verify follow state persists

 *

## 8\. Event Collaboration (Co-Organizer Invites)

### 8.1 Invite a Co-Organizer

- [ ] As Organizer A, navigate to event management page (`/organizer/events/[id]`)
- [ ] Find Collaboration Panel
- [ ] Click “Invite” → search for Organizer B by name
- [ ] Select permission level (VIEW\_ONLY / ANALYTICS / SCAN / FULL)
- [ ] Click “Invite” on the search result
- [ ] Verify invite appears in collaborator list with “Pending” status

### 8.2 Accept Collaboration Invite

- [ ] As Organizer B, navigate to `/organizer` dashboard
- [ ] Verify collaboration invite appears at top of dashboard
- [ ] Click “Accept”
- [ ] Verify invite disappears from dashboard
- [ ] Verify the event now appears in Organizer B’s event list
- [ ] Verify “Co-organizer · {permission}” badge on the event card

### 8.3 Reject Collaboration Invite

- [ ] As Organizer A, invite a different organizer (Organizer D)
- [ ] As Organizer D, click “Reject”
- [ ] Verify invite disappears from dashboard
- [ ] Verify event does NOT appear in Organizer D’s event list

### 8.4 Co-Organizer Access — VIEW\_ONLY

- [ ] As Organizer A, invite Organizer B with VIEW\_ONLY
- [ ] As Organizer B, open the collaborated event
- [ ] Verify event details page loads
- [ ] Verify “Co-organizer · VIEW\_ONLY” badge shows
- [ ] Verify Analytics panel is HIDDEN
- [ ] Verify Attendees/Orders section is HIDDEN
- [ ] Verify Door Scanner button is HIDDEN
- [ ] Verify Edit form is HIDDEN
- [ ] Verify Cancel/Postpone is HIDDEN
- [ ] Verify Collaboration Panel is HIDDEN (owner only)

### 8.5 Co-Organizer Access — ANALYTICS

- [ ] As Organizer A, change Organizer B’s permission to ANALYTICS (via dropdown)
- [ ] As Organizer B, reload the event page
- [ ] Verify Analytics panel is VISIBLE
- [ ] Verify Waitlist panel is VISIBLE
- [ ] Verify Attendees/Orders section is VISIBLE
- [ ] Verify Payment verification queue is VISIBLE (if pending orders)
- [ ] Verify Door Scanner button is HIDDEN
- [ ] Verify Walk-in check-in is HIDDEN
- [ ] Verify Edit form is HIDDEN
- [ ] Verify Cancel/Postpone is HIDDEN

### 8.6 Co-Organizer Access — SCAN

- [ ] As Organizer A, change Organizer B’s permission to SCAN
- [ ] As Organizer B, reload the event page
- [ ] Verify Door Scanner button is VISIBLE
- [ ] Verify Walk-in check-in is VISIBLE
- [ ] Verify Analytics panel is HIDDEN
- [ ] Verify Attendees/Orders section is HIDDEN
- [ ] Verify Edit form is HIDDEN

### 8.7 Co-Organizer Access — FULL

- [ ] As Organizer A, change Organizer B’s permission to FULL
- [ ] As Organizer B, reload the event page
- [ ] Verify Analytics panel is VISIBLE
- [ ] Verify Attendees/Orders is VISIBLE
- [ ] Verify Door Scanner is VISIBLE
- [ ] Verify Edit form is VISIBLE
- [ ] Verify Hero Boost / Slot Boost is VISIBLE
- [ ] Verify Cancel/Postpone is VISIBLE
- [ ] Verify Collaboration Panel is HIDDEN (owner only)

### 8.8 Change Permission Level (Owner)

- [ ] As Organizer A, use the permission dropdown on a collaborator
- [ ] Change from VIEW\_ONLY → FULL
- [ ] Verify the dropdown updates
- [ ] As Organizer B, reload → verify new permission level applies

### 8.9 Remove Collaborator

- [ ] As Organizer A, click X on a collaborator
- [ ] Verify collaborator removed from list
- [ ] As the removed organizer, verify event disappears from dashboard

### 8.10 Sub-Page Access Control

- [ ] As Organizer B with VIEW\_ONLY, try `/organizer/events/[id]/scan` → 404
- [ ] As Organizer B with VIEW\_ONLY, try `/organizer/events/[id]/orders` → 404
- [ ] As Organizer B with VIEW\_ONLY, try `/organizer/events/[id]/checkins` → 404
- [ ] As Organizer B with VIEW\_ONLY, try `/organizer/events/[id]/report` → 404
- [ ] As Organizer B with SCAN, try `/organizer/events/[id]/scan` → loads
- [ ] As Organizer B with SCAN, try `/organizer/events/[id]/orders` → 404
- [ ] As Organizer B with ANALYTICS, try `/organizer/events/[id]/orders` → loads
- [ ] As Organizer B with ANALYTICS, try `/organizer/events/[id]/report` → loads
- [ ] As Organizer B with FULL, try all sub-pages → all load

### 8.11 Co-Organizer Display on Public Event Page

- [ ] As a visitor, navigate to the event page
- [ ] Verify both Organizer A and Organizer B names appear as co-organizers

 *

## 9\. Event Management (Owner)

### 9.1 Edit Event

- [ ] As Organizer A, edit event details (title, description, venue, time)
- [ ] Verify changes save and persist
- [ ] Verify tier add/remove works
- [ ] Verify gallery photos can be added/removed
- [ ] Verify editing locked within 2 hours of event start

### 9.2 Cancel Event

- [ ] As Organizer A, cancel a published event
- [ ] Verify CANCELLATION\_REQUESTED → CANCELLED flow
- [ ] Verify ticket holders notified
- [ ] Verify subscribers notified
- [ ] Verify refund records created
- [ ] Verify event shows “Cancelled” status

### 9.3 Postpone Event

- [ ] As Organizer A, postpone a published event
- [ ] Verify POSTPONED status
- [ ] Verify ticket holders notified
- [ ] Verify subscribers notified
- [ ] Verify new date validation (must be future)

### 9.4 Publish Draft

- [ ] As Organizer A, publish a draft event
- [ ] Verify status changes to PUBLISHED
- [ ] Verify event appears on homepage

 *

## 10\. Door Scanner & Check-in

### 10.1 Per-Event Door Scanner

- [ ] As Organizer A (or co-organizer with SCAN), navigate to `/organizer/events/[id]/scan`
- [ ] Verify scanner loads (html5-qrcode)
- [ ] Scan a valid ticket QR → verify check-in success
- [ ] Scan same ticket again → verify “Already checked in” message
- [ ] Scan a ticket from a different event → verify rejection
- [ ] Verify scanner is locked to the specific event

### 10.2 Walk-in Check-in

- [ ] Before event: use Walk-in Registration form → verify VALID ticket created
- [ ] During event: use Walk-in Check-in → verify USED ticket (instant check-in)

### 10.3 Check-ins Page

- [ ] Navigate to `/organizer/events/[id]/checkins`
- [ ] Verify checked-in attendees list
- [ ] Verify not-checked-in list
- [ ] Verify cancelled tickets list
- [ ] Verify stats (checked in / not checked in / cancelled)

### 10.4 Scanner PIN with Staff Contact Info

- [ ] As Organizer A, navigate to event management page → find Scanner PIN Manager
- [ ] Select “Single PIN” mode
- [ ] Enter staff name, email (optional), phone (optional)
- [ ] Click “Generate PIN” → verify PIN appears with staff name
- [ ] Verify active PIN list shows email (with mail icon) and phone (with phone icon)
- [ ] Select “Paste names” mode
- [ ] Enter multiple staff names (one per line)
- [ ] Enter parallel emails and phones (one per line, optional)
- [ ] Generate → verify all PINs created with contact info
- [ ] Select “Bulk by count” mode → verify no email/phone fields (bulk mode uses pattern only)
- [ ] Revoke a PIN → verify it moves to “Revoked PINs” section
- [ ] Print PIN sheet → verify print dialog opens

### 10.5 Scanner PIN Login Flow

- [ ] Navigate to `/scan` (public, no login required)
- [ ] Verify event selector dropdown shows published events
- [ ] Enter a valid 6-digit PIN for the selected event
- [ ] Click “Enter scanner” → verify scanner loads
- [ ] Enter an invalid PIN → verify “Invalid PIN for this event” error
- [ ] Enter a PIN from a different event → verify rejection
- [ ] Enter a revoked PIN → verify rejection
- [ ] Verify rate limiting (20 attempts/min) kicks in after repeated failures

 *

## 11\. Orders & Revenue

### 11.1 Orders Page

- [ ] Navigate to `/organizer/events/[id]/orders`
- [ ] Verify all orders listed
- [ ] Verify confirmed/pending/failed status badges
- [ ] Verify buyer name, tier, quantity, amounts

### 11.2 Payment Verification

- [ ] As a user, book a ticket with manual UPI + UTR
- [ ] As Organizer A, verify order appears in Payment Verification queue
- [ ] Approve the order → verify status changes to CONFIRMED
- [ ] Verify ticket generated for the buyer
- [ ] Reject a different order → verify status changes to FAILED

### 11.3 Print Report

- [ ] Navigate to `/organizer/events/[id]/report`
- [ ] Verify report shows: revenue summary, confirmed orders, attendee tickets
- [ ] Verify print button works (opens print dialog)

 *

## 12\. Organizer Analytics

### 12.1 Per-Event Analytics

- [ ] Navigate to event management page
- [ ] Verify Analytics panel shows: orders, revenue, payout, check-ins, waitlist
- [ ] Verify capacity bar
- [ ] Verify tier breakdown

### 12.2 Aggregate Dashboard

- [ ] Navigate to `/organizer?tab=analytics`
- [ ] Verify overview stats (total events, orders, confirmed, tickets sold, gross revenue, convenience fee, net payout, check-ins, no-shows, waitlist)
- [ ] Verify total capacity filled bar
- [ ] Verify 30-day revenue trend chart (bar chart with daily revenue)
- [ ] Hover over a bar → verify tooltip shows revenue amount
- [ ] Verify attendance breakdown chart
- [ ] Verify order status chart
- [ ] Verify revenue by event (top 5)
- [ ] Verify draft events excluded from aggregate metrics

 *

## 13\. Boosting & Promotions

### 13.1 Slot Boost

- [ ] As Organizer A, navigate to `/organizer/boost?event=[id]`
- [ ] Submit boost request with UPI + UTR
- [ ] As admin, approve the boost → verify event appears in boosted slots
- [ ] As admin, reject a boost → verify event doesn’t appear

### 13.2 Hero Boost

- [ ] As Organizer A, purchase Hero Boost from event management page
- [ ] Verify UPI QR + UTR submission flow
- [ ] As admin, verify boost in `/admin/hero-boosts`
- [ ] Admin activates boost → verify event appears in homepage Hero Carousel
- [ ] Verify carousel auto-rotates
- [ ] Verify dot indicators work
- [ ] Verify `?source=HERO_BOOST` in carousel links
- [ ] Cancel event → verify it’s removed from Hero Carousel

 *

## 14\. Clubs & Crews

### 14.1 Create Club

- [ ] Navigate to club creation form
- [ ] Fill club name, description, display picture, cover photo
- [ ] Set UPI ID for paid membership
- [ ] Verify QR code generates
- [ ] Submit → verify club created

### 14.2 Join Club

- [ ] As another user, navigate to club page
- [ ] Join club (free or paid)
- [ ] Verify membership appears
- [ ] As club creator, verify member appears in member list

### 14.3 Admin Verification

- [ ] As admin, navigate to `/admin/clubs`
- [ ] Verify/unverify a club
- [ ] Verify badge updates on public club page

 *

## 15\. Reviews & Ratings

### 15.1 Submit Review

- [ ] As a user with a USED ticket (checked in), navigate to organizer profile
- [ ] Submit a 1-5 star review with text
- [ ] Verify review appears on organizer profile
- [ ] Verify average rating updates
- [ ] Verify rating distribution updates

### 15.2 Review Constraints

- [ ] As a user without a USED ticket → verify cannot submit review
- [ ] As a user, try to submit a second review for same event → verify blocked (one review per event per user)
- [ ] As the review author, delete own review → verify removed
- [ ] As organizer, try to delete a review → verify blocked
- [ ] As admin, delete any review → verify removed

 *

## 16\. Admin Dashboard

### 16.1 Admin Overview

- [ ] Navigate to `/admin`
- [ ] Verify overview stats (events, orders, revenue, boosts, hero boosts, clubs, users)
- [ ] Verify pending hero boost alert banner (if any pending)
- [ ] Verify cross-links to boost pages

### 16.2 Admin Events

- [ ] Navigate to `/admin/events`
- [ ] Search by title
- [ ] Filter by status, city, category (verify Gaming filter works)
- [ ] Inline edit an event
- [ ] Feature/unfeature an event
- [ ] Cancel/re-publish an event
- [ ] Delete an event

### 16.3 Admin Settings

- [ ] Navigate to `/admin/settings`
- [ ] Change platform commission → verify checkout reflects new fee
- [ ] Change boost pricing → verify boost page reflects new price
- [ ] Change door staff pricing
- [ ] Change cancellation/postponement charges
- [ ] Change taglines (header, subheader, footer) → verify homepage updates
- [ ] Change door staff availability count

### 16.4 Admin Users

- [ ] Navigate to `/admin/users`
- [ ] Verify multiple users listed
- [ ] Toggle admin status for a user
- [ ] Verify non-admin can’t access `/admin` after toggle

### 16.5 Admin Legal Pages

- [ ] Navigate to `/admin/legal`
- [ ] Create a new legal page
- [ ] Edit an existing legal page
- [ ] Delete a legal page
- [ ] Verify public page at `/legal/[slug]` renders markdown correctly

### 16.6 Admin Revenue

- [ ] Navigate to `/admin/revenue`
- [ ] Verify gross revenue, platform commission, net payouts
- [ ] Verify per-event breakdown table

### 16.7 Admin Strict Authorization

- [ ] As non-admin, try to access `/admin` → verify redirect/blocked
- [ ] As non-admin, try to call admin server actions → verify blocked
- [ ] Verify no zero-admin fallback (if no admins exist, no one gets admin access)

### 16.8 Admin KYC Review

- [ ] Navigate to `/admin/kyc` → verify KYC Review page loads
- [ ] Verify “KYC Review” link appears in admin sidebar
- [ ] Verify filter tabs: Pending, Clarification Needed, Approved, Rejected, All
- [ ] Default view shows Pending + Clarification Needed submissions
- [ ] Click “Approved” filter → verify only approved organizers shown
- [ ] Click “All” filter → verify all organizers with KYC shown
- [ ] Verify each submission card shows: organizer name, avatar, owner email/phone, PAN, GST, bank details, UPI ID, submission date
- [ ] Verify status badge color matches status (amber=pending, green=approved, red=rejected, blue=clarification)

### 16.9 KYC Approve Flow

- [ ] As a new organizer, complete the 5-step KYC wizard
- [ ] Verify `kyc_status = PENDING` is set automatically
- [ ] As admin, navigate to `/admin/kyc` → verify the new submission appears in Pending
- [ ] Click “Approve” → verify confirmation prompt
- [ ] Confirm approval → verify status changes to APPROVED
- [ ] Verify organizer’s `verified` flag is set to true
- [ ] As the organizer, check bell icon → verify “Organizer Verified!” notification appears
- [ ] As the organizer, navigate to `/organizer` → verify NO KYC status banner (approved = no banner)

### 16.10 KYC Reject Flow

- [ ] As admin, find a pending submission → click “Reject”
- [ ] Verify note field appears (required)
- [ ] Try to submit without a note → verify error “Please provide a reason for rejection”
- [ ] Enter a rejection reason → click “Confirm Rejection”
- [ ] Verify status changes to REJECTED
- [ ] Verify organizer’s `verified` flag is set to false
- [ ] As the organizer, check bell icon → verify “Organizer Application Rejected” notification appears
- [ ] As the organizer, navigate to `/organizer` → verify red “KYC Rejected” banner with the rejection reason

### 16.11 KYC Clarification Flow

- [ ] As admin, find a pending submission → click “Request Clarification”
- [ ] Verify note field appears (required)
- [ ] Enter what clarification is needed → click “Send Clarification Request”
- [ ] Verify status changes to CLARIFICATION\_NEEDED
- [ ] As the organizer, check bell icon → verify “Clarification Needed — We’ll Contact You” notification appears
- [ ] Verify notification message includes “An Outsiderr team member will contact you shortly”
- [ ] As the organizer, navigate to `/organizer` → verify blue “Clarification Needed” banner
- [ ] As admin, verify the submission moves to “Clarification Needed” filter tab
- [ ] As admin, verify the previous review note is shown on the submission card

### 16.12 KYC Re-review (Clarification → Approve)

- [ ] As admin, find a submission with CLARIFICATION\_NEEDED status
- [ ] Click “Approve” → verify it can be approved after clarification
- [ ] Verify status changes to APPROVED
- [ ] Verify the previous review note is cleared
- [ ] As the organizer, verify new “Organizer Verified!” notification appears

### 16.13 Event Fee Lock (post-start)

- [ ] Admin → `/admin/events` → find an **upcoming** paid event → commission/fee form is editable → change values → saves + audit row written
- [ ] Find a **live/past** (started) event → fee area is a read-only summary ("locked — event started"), no form
- [ ] Try to bypass via a crafted request → `adminUpdateEventFeesAction` returns "Event has already started — fees are locked."
- [ ] Verify Edit/Feature/Cancel/Publish/Delete are all hidden on a started event (whole card view-only)

 *

## 17\. Notifications

### 17.1 Notification Bell

- [ ] Verify bell icon in navbar with unread count badge
- [ ] Click bell → verify notifications dropdown
- [ ] Verify realtime updates (new notification appears without reload)

### 17.2 Notification Types

- [ ] Book ticket → verify booking success notification
- [ ] Event cancelled → verify cancellation notification
- [ ] Event postponed → verify postponement notification
- [ ] Event venue changed → verify VENUE\_CHANGE notification
- [ ] Event city changed → verify CITY\_CHANGE notification
- [ ] Event time changed → verify TIME\_CHANGE notification
- [ ] Waitlist offer → verify WAITLIST\_OFFER notification
- [ ] Collaboration invite → verify COLLAB\_INVITE notification
- [ ] Collaboration accepted → verify COLLAB\_ACCEPTED notification
- [ ] KYC approved → verify KYC\_APPROVED notification (“Organizer Verified!”)
- [ ] KYC rejected → verify KYC\_REJECTED notification (with rejection reason)
- [ ] KYC clarification → verify KYC\_CLARIFICATION notification (“An Outsiderr team member will contact you”)

### 17.3 Notification Outbox (external delivery seam)

- [ ] `sendNotification(..., channels: ["push"])` → row appears in `notification_outbox` (status PENDING, channel push)
- [ ] `claim_notification_outbox(10)` via service → returns rows, flips to SENDING, attempts +1
- [ ] `complete_notification_outbox(id, false)` → row back to PENDING with `next_attempt_at` in the future (attempts² backoff); ≥5 attempts → FAILED
- [ ] `complete_notification_outbox(id, true)` → SENT
- [ ] Rows older than 24h → marked EXPIRED on next claim (no stale blast when a provider is enabled later)
- [ ] `GET /api/cron/drain-notifications` with bad secret → 401; with `CRON_SECRET` → 200 `{status:"skipped"}` while no provider env (EXPO_ACCESS_TOKEN / FCM_SERVER_KEY / WEB_PUSH_PRIVATE_KEY)
- [ ] `notification_outbox` not readable/writable by anon or authenticated roles (service-role only)
- [ ] `node scripts/_test_analytics_rollup.mjs` → T17–T21 cover this end-to-end

 *

## 18\. Legal & Info Pages

### 18.1 Public Legal Pages

- [ ] Navigate to `/legal/terms` → verify Terms page renders
- [ ] Navigate to `/legal/privacy` → verify Privacy page renders
- [ ] Navigate to `/legal/refund` → verify Refund Policy renders
- [ ] Navigate to `/legal/cancellation` → verify Cancellation Policy renders
- [ ] Verify markdown rendering (headings, bullet lists, paragraphs)

### 18.2 Info Pages

- [ ] Navigate to `/about` → verify About Us page
- [ ] Navigate to `/contact` → verify Contact Us page

### 18.3 Footer

- [ ] Verify footer with 4 columns (Brand + social, Help, Quick Links, Legal)
- [ ] Verify social links work (Instagram, Facebook, YouTube, WhatsApp)
- [ ] Verify quick links adapt (Become Organizer vs Manage Events)
- [ ] Verify legal links work
- [ ] Verify consent notice
- [ ] Verify responsive (stacks on mobile)

 *

## 19\. Loading States

### 19.1 Branded Loader

- [ ] Navigate to each route and verify branded spinner appears:
*   `/` (home)
*   `/admin`
*   `/checkout`
*   `/clubs`
*   `/clubs/[id]`
*   `/events/[id]`
*   `/login`
*   `/organizer`
*   `/organizer/events/[id]`
*   `/organizers/[id]`
*   `/profile`
*   `/scan`
*   `/tickets`
- [ ] Verify spinner uses neon-gradient (purple → pink)
- [ ] Verify spinner animates (rotates)
- [ ] Verify skeleton structure retained below spinner

 *

## 20\. Error Handling & Edge Cases

### 20.1 404 Page

- [ ] Navigate to a non-existent route → verify branded 404 page

### 20.2 Past Events

- [ ] Verify past events excluded from Featured, Happening Today, Popular, All Events
- [ ] Verify past events appear in “Past Events” section with disabled cards
- [ ] Verify past event management page is read-only (no edit, no cancel, no boost)

### 20.3 Permission Boundaries

- [ ] As non-organizer, try `/organizer` → verify become-organizer form shown
- [ ] As Organizer B (co-organizer with VIEW\_ONLY), try to edit event → verify form hidden
- [ ] As Organizer B (co-organizer with SCAN), try to view analytics → verify hidden
- [ ] As a regular user, try `/organizer/events/[id]` → verify 404/redirect
- [ ] As a regular user, try `/admin` → verify redirect

### 20.4 Financial Accuracy

- [ ] Book 10 tickets × ₹450 with 5% platform fee
- [ ] Verify: subtotal = ₹4,500, convenience fee = ₹135, buyer pays ₹4,635
- [ ] Verify: commission = ₹225, organizer payout = ₹4,275
- [ ] Verify: platform retains ₹225 + ₹135 = ₹360
- [ ] Run `npx vitest run` → verify 102 tests pass (financial, validation, rate-limit, fixtures)

 *

## 21\. PWA & Branding

### 21.1 PWA

- [ ] Verify manifest.webmanifest loads
- [ ] Verify service worker registers
- [ ] Verify icons load (apple-icon, favicon)
- [ ] Verify installable on mobile

### 21.2 Theme-Aware Logo

- [ ] Toggle dark/light mode → verify logo switches
- [ ] Verify logo in navbar, favicon

 *

## 22\. Automated Tests

### 22.1 Run Test Suite

```bash
npx vitest run
```

- [ ] Verify 7 test files pass
- [ ] Verify 113 tests pass
- [ ] Verify financial tests (19) — canonical 10×₹450 example
- [ ] Verify validation tests (35) — Zod schemas
- [ ] Verify rate-limit tests (10) — sliding window
- [ ] Verify fixture tests (38) — data integrity
- [ ] Verify api-auth tests (5) — bearer/ALS context

### 22.2 E2E API Suite (seeded roles)

```bash
npx next build && npx next start -p 3124   # production build — dev-mode
# compiles stall long enough to expire the test JWTs; don't run against next dev
node scripts/_seed_dev_test.mjs
node scripts/_e2e_dev_test.mjs            # default base http://localhost:3124
```

- [ ] Verify 72 assertions pass (auth, free/manual orders, approve/reject,
      subscribe/follow, waitlist FIFO, scanner, box-office, event lifecycle,
      burst no-oversell, reviews, cancel/refund, collab, clubs, postponement)
- [ ] Seed users: `dev.{user,user2,user3,organizer,organizer2,admin}@outsiderr.test` (pw `DevTest#1234`)
- [ ] `/dev-login` page = one-click sign-in in dev; hard-404s in production
- [ ] Re-runnable: the suite resets its state at the start of each run

### 22.3 Build

```bash
npx next build
```

- [ ] Verify build compiles successfully
- [ ] Verify zero type errors
- [ ] Verify all routes generated

 *

## 23\. Box Office (On-Site Sales)

### 23.1 Box Office PIN Generation (Organizer)

- [ ] Organizer → `/organizer` → Box Office PIN manager → generate a PIN for a staff member
- [ ] Verify PIN appears in active list with staff name (+ email/phone if set)
- [ ] Verify revoke removes the PIN from the active list

### 23.2 Box Office Login (Staff)

- [ ] Staff opens `/box-office` → enters the organizer’s box-office PIN → sees the event picker
- [ ] Wrong PIN → error shown, no access
- [ ] Revoked PIN → access denied

### 23.3 Box Office Order (Cash / On-Site UPI)

- [ ] Staff selects event + tier + quantity → enters buyer name/contact → creates order
- [ ] Verify **no convenience fee** is added (box-office = ₹0 fee) but commission still applies
- [ ] Verify inventory decreases by quantity
- [ ] Verify ticket QR(s) generated and shown/printable

### 23.4 Admin Box Office Views

- [ ] Admin → `/admin/box-office` and `/admin/box-office-pins` load and list records
- [ ] Verify box-office orders appear in revenue/orders with correct split

## 24\. Offline Scan & Sync

### 24.1 Offline Mode

- [ ] Open `/scan`, log in with a scanner PIN, then go offline (DevTools → Network → Offline)
- [ ] Verify the **OfflineStatus** indicator appears (queued/syncing count)
- [ ] Scan a valid ticket QR while offline → it queues locally (IndexedDB)

### 24.2 Sync on Reconnect

- [ ] Come back online → queued scans sync automatically
- [ ] Verify check-ins land on the server and the queued count returns to 0
- [ ] Verify a duplicate/offline-then-online scan doesn’t double-count the check-in

## 25\. Mobile & Navigation

### 25.1 Admin Mobile Navigation (hamburger)

- [ ] On a mobile viewport (<1024px) open any `/admin/*` page
- [ ] Verify a **hamburger in the global header top-left** (before the logo), mobile-only
- [ ] Tap hamburger → left drawer slides in over the page listing all admin options
- [ ] Tap **outside** (backdrop) → drawer closes
- [ ] Tap a link → navigates and drawer closes
- [ ] Press `Escape` → drawer closes
- [ ] Verify current page is highlighted in the drawer
- [ ] Hamburger is hidden on non-admin pages and on desktop (≥1024px shows the sidebar)
- [ ] On desktop (≥1024px) the hamburger is hidden and the left sidebar shows instead

### 25.2 General Mobile Layout

- [ ] Homepage, event page, checkout, tickets render cleanly on a 375px viewport
- [ ] No horizontal scroll; bottom nav / sticky elements don’t overlap content
- [ ] Global navbar hamburger/menu works on mobile

## 26\. Concurrency, Money & Inventory Edge Cases

### 26.1 Burst Booking (no oversell)

- [ ] Open the same event in many tabs/browsers, hit "Book" simultaneously
- [ ] If tickets ≥ demand → **all** orders succeed (each becomes RESERVED), inventory decrements per order
- [ ] If tickets < demand → orders fill capacity exactly; extras get "Not enough tickets" + waitlist option — **never** over-sold
- [ ] Confirm `quantity_sold` never exceeds `quantity` in the DB

### 26.2 Reservation Window (Razorpay)

- [ ] Reserve an order, don't pay → inventory held 15 min then released by `expire-reservations` cron
- [ ] Reserved seats count against availability (sold + reserved) while held
- [ ] After expiry → seats free up, tier no longer shows sold-out

### 26.3 Idempotency & Double-Confirm

- [ ] Trigger both the Razorpay callback and the webhook for the same order → order confirms once, single set of tickets (no dup mint)
- [ ] Re-run `confirm_razorpay_order` on a CONFIRMED order → returns existing tickets, no error
- [ ] `fail_razorpay_order` on a non-RESERVED order → no-op, no crash

### 26.4 Double-Booking Guard

- [ ] A user with an active order (CONFIRMED/RESERVED/PENDING) tries to book the same event again → blocked
- [ ] Two users booking the last seat concurrently → exactly one succeeds

### 26.5 Money Math — every path

- [ ] **Server is authoritative:** order RPCs recompute all paise fields from tier price + event fee config — caller-supplied amounts are ignored (verify via a manipulated RPC call: stored row ≠ submitted values)
- [ ] **Online paid:** buyer pays `subtotal + convenience_fee`; organizer gets `subtotal − commission`; platform keeps `commission + convenience_fee`
- [ ] **Free:** ₹0 everywhere; no fees; ticket still mints
- [ ] **Manual UPI / box office / walk-in:** convenience fee ₹0, commission still applies
- [ ] **`fee_payer = USER` vs `ORGANIZER`:** verify which side absorbs the fee per event setting
- [ ] **Refund on cancel/postpone:** refund math + `payment_ledger` rows correct; check who bears the fee
- [ ] Reject a pending order → inventory/payment state consistent

### 26.6 Inventory Restoration

- [ ] Reject a RESERVED order → reserved released
- [ ] Let a reservation expire → released
- [ ] Cancel a confirmed order → sold decremented, ticket freed for waitlist offer

## 27\. Security & Authorization

### 27.1 Role Boundaries (RLS + guards)

- [ ] Regular user → `/admin/*`, `/organizer/*` → blocked/redirected
- [ ] Non-admin calls a `requireAdmin` action → rejected
- [ ] Organizer A reads Organizer B's event/orders → blocked by RLS
- [ ] Unauthenticated → any protected route/action → auth error or redirect

### 27.2 RPC / Action Abuse

- [ ] Call `create_*_order` with qty > remaining → rejected, no partial write
- [ ] Call `create_*_order` for a paid tier via the free path → rejected
- [ ] Replay a payment/confirm action → idempotent (no dup tickets/orders)
- [ ] Non-staff calls `approve_order`/`reject_order` → `is_event_manager` blocks it (door staff cannot approve; only owner/admin/FULL collaborator)

### 27.3 PIN & Rate Limiting

- [ ] Wrong scanner/box-office PIN repeatedly → rate-limited / denied
- [ ] Revoked PIN → immediately unusable
- [ ] PIN never returned/stored in plaintext (hashed)

### 27.4 Input Validation & XSS

- [ ] Submit event/booking forms with `<script>`/HTML in title, bio, description → stored/escaped, no XSS render
- [ ] Oversized/invalid inputs → Zod validation errors, no crash
- [ ] SQL-injection-style strings in search/filters → safe (parameterized)

### 27.5 Privilege & Money Integrity (added post-hardening)

- [ ] `confirm_razorpay_order` / `fail_razorpay_order` / `create_walkin_order` / `update_walkin_order` / `offer_waitlist_next` called with the **anon key** → permission denied (service-role only)
- [ ] `create_reserved_order` / `create_paid_order` called with fake paise params (`total=1`, `payout=999999`) → order rows contain **server-recomputed** amounts (tier price × qty + bps fees), caller values ignored
- [ ] Direct `PATCH profiles` with `is_admin: true` → column privilege error (not updatable)
- [ ] Direct `PATCH organizers` with `kyc_status: APPROVED` / `verified: true` / `commission_*` → column privilege error; KYC data fields (pan/gst/bank/docs) still updatable by owner
- [ ] Direct `PATCH events` with `status` / `organizer_id` → column privilege error; status changes only via `set_event_status` RPC / `cancel_event` / `postpone_event`
- [ ] `GET /rest/v1/organizers` as anon → returns nothing sensitive; `organizers_public` view exposes only safe columns (no PAN/bank/KYC) and still includes `upi_id`
- [ ] `organizers` INSERT with `kyc_status='APPROVED'`/`verified=true` → policy rejects; legit insert starts `NOT_SUBMITTED`
- [ ] `PATCH /api/v1/organizer` with a partial body → only sent fields change (omitted fields not wiped to "" / null)
- [ ] Razorpay webhook: `payment.captured` event with `x-razorpay-event-id` header → processes; unknown order id → falls back to hero-boost activation; replay → idempotent

## Test Execution Checklist

| Module | Scenarios | Status |
| --- | --- | --- |
| Auth & Profile | 1.1–1.2 | ☐ |
| Organizer Onboarding | 2.1–2.4 | ☐ |
| Event Creation | 3.1–3.8 | ☐ |
| Event Discovery | 4.1–4.4 | ☐ |
| Booking & Tickets | 5.1–5.6 | ☐ |
| Update Me Subscriptions | 6.1–6.4 | ☐ |
| Follow/Unfollow | 7.1–7.3 | ☐ |
| Collaboration | 8.1–8.11 | ☐ |
| Event Management | 9.1–9.4 | ☐ |
| Door Scanner | 10.1–10.5 | ☐ |
| Orders & Revenue | 11.1–11.3 | ☐ |
| Organizer Analytics | 12.1–12.2 | ☐ |
| Boosting | 13.1–13.2 | ☐ |
| Clubs & Crews | 14.1–14.3 | ☐ |
| Reviews & Ratings | 15.1–15.2 | ☐ |
| Admin Dashboard | 16.1–16.13 | ☐ |
| Notifications | 17.1–17.3 | ☐ |
| Legal & Info Pages | 18.1–18.3 | ☐ |
| Loading States | 19.1 | ☐ |
| Error Handling | 20.1–20.4 | ☐ |
| PWA & Branding | 21.1–21.2 | ☐ |
| Automated Tests | 22.1–22.3 | ☐ |
| Box Office | 23.1–23.4 | ☐ |
| Offline Scan & Sync | 24.1–24.2 | ☐ |
| Mobile & Navigation | 25.1–25.2 | ☐ |
| Concurrency & Money | 26.1–26.6 | ☐ |
| Security & Auth | 27.1–27.5 | ☐ |
### 2.5 KYC Polish & Thread

- [ ] Doc uploads (PAN/bank) use a plain file picker — no cropper, accepts image + PDF
- [ ] File >1 MB → inline red error under the upload button ("keep it under 1 MB"), nothing uploads
- [ ] Page reload lands at the top of the page (no scroll-restore jump)
- [ ] PENDING state → status banner + withdraw only (no response form until admin acts)
- [ ] REJECTED/CLARIFICATION → "Update & resubmit" form visible, button reads "Resubmit application"
- [ ] Admin KYC page: filter tabs show counts — Pending (n), Clarification Needed (n), Approved (n), Rejected (n), All (n)
- [ ] Admin card shows PAN document + bank proof links, organizer's response note, and full communication thread with admin emails
- [ ] Clarification message tells the organizer to respond in the dashboard (no "team member will contact you")
