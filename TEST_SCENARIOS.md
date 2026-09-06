# Outsiderr — Full App Test Scenarios & Test Cases

## How to use this document
- Run each test in order — later tests depend on earlier ones
- Mark each as PASS / FAIL / BLOCKED
- For FAIL, note the actual behavior and screenshot if possible
- Prerequisites: Supabase running, `fix_all.sql` applied, `.env` configured, `npx next build` passes

---

## SECTION 1 — Authentication

### TC-1.1 Sign Up (new user)
**Steps:**
1. Go to `/login`
2. Click "Sign up" toggle
3. Enter email: `testuser1@example.com`, password: `test1234`
4. Click "Create account"
**Expected:** Account created. If email confirmation is ON → "Check your email" message. If OFF → redirected to homepage, logged in (user menu visible, notification bell visible).
**Verify:** Homepage renders immediately without manual refresh.

### TC-1.2 Sign In (existing user)
**Steps:**
1. Go to `/login`
2. Enter email + password
3. Click "Sign in"
**Expected:** Hard redirect to homepage. User menu shows in top-right. No blank screen.

### TC-1.3 Sign Out
**Steps:**
1. Click user menu (top-right)
2. Click "Sign out"
**Expected:** Session cleared. Homepage shows logged-out state (Login button visible).

### TC-1.4 Protected Route — Unauthenticated
**Steps:**
1. Sign out
2. Visit `/tickets` directly
3. Visit `/organizer` directly
4. Visit `/checkout` directly
5. Visit `/admin` directly
**Expected:** Each redirects to `/login?next=...` with return URL.

### TC-1.5 Wrong Password
**Steps:**
1. Go to `/login`
2. Enter valid email + wrong password
3. Submit
**Expected:** Error message "Invalid login credentials". Stays on login page.

### TC-1.6 Non-Admin Blocked from Admin
**Steps:**
1. Sign in as a regular user (not admin)
2. Visit `/admin`
**Expected:** Redirected to homepage or shown "not authorized".

---

## SECTION 2 — User Profile

### TC-2.1 Edit Profile — Name & Phone
**Steps:**
1. Sign in as user
2. Go to `/profile`
3. Change full name to "Test User One"
4. Change phone to "9876543210"
5. Click "Save"
**Expected:** Profile updated. Name shows in user menu.

### TC-2.2 Edit Profile — Gender
**Steps:**
1. On `/profile`, find gender field
2. Select "Male" / "Female" / "Other" / "Prefer not to say"
3. Save
4. Reload the page
**Expected:** Gender persists across reloads.

### TC-2.3 Upload Profile Image with Crop
**Steps:**
1. On `/profile`, click "Upload" under profile photo
2. Select an image file
3. Crop modal opens
4. Drag to reposition, zoom in/out
5. Click "Crop & Save"
**Expected:** Cropped image uploaded. Profile photo updates. No uncropped original shown.

### TC-2.4 Add Social Links
**Steps:**
1. On `/profile`, scroll to social links section
2. Enter Instagram URL: `https://instagram.com/testuser`
3. Enter YouTube URL: `https://youtube.com/@testuser`
4. Enter X URL: `https://x.com/testuser`
5. Enter Facebook URL: `https://facebook.com/testuser`
6. Enter LinkedIn URL: `https://linkedin.com/in/testuser`
7. Save
**Expected:** All 5 social links saved. No errors.

### TC-2.5 Birthdate — No Future Dates
**Steps:**
1. On `/profile`, click birthdate field
2. Try to select a date after today
**Expected:** Calendar does not allow selecting future dates (max = today).

### TC-2.6 Interested In — Category Chips
**Steps:**
1. On `/profile`, scroll to "Interested in" section
2. Verify two subsections visible: "Categories" and "Tags"
3. Click category chips: "Hip Hop Parties", "Car & Bike Meetups", "Cyphers & Battles"
4. Click some tag chips: "Hip Hop Party", "Car Meet", "Rap Cypher"
5. Save profile
6. Reload page
**Expected:** All selected category chips and tag chips remain selected after reload.

### TC-2.7 Interested In — Deselect
**Steps:**
1. Click an already-selected category chip
2. Save
3. Reload
**Expected:** Chip is no longer selected.

---

## SECTION 3 — Organizer Onboarding

### TC-3.1 Become Organizer — Full 5-Step Flow
**Steps:**
1. Sign in as a non-organizer user
2. Go to `/organizer`
3. Step 1: Enter organizer name "Test Organizer", bio, upload avatar (with crop), upload cover (with crop)
4. Step 2: Enter PAN number "ABCDE1234F", PAN name "Test Organizer"
5. Step 3: Skip GST (optional) OR enter GST number
6. Step 4: Enter UPI ID "testorg@upi", bank account "1234567890", IFSC "HDFC0001234", account name "Test Organizer"
7. Step 5: Check "I agree to terms", submit
**Expected:** Organizer profile created. Redirected to `/organizer` dashboard. "Create event" tab visible.

### TC-3.2 Invalid PAN Format
**Steps:**
1. In Step 2, enter PAN "12345" (invalid format)
2. Try to advance
**Expected:** Validation error. Cannot advance to Step 3.

### TC-3.3 Invalid IFSC Format
**Steps:**
1. In Step 4, enter IFSC "123" (invalid)
2. Try to advance
**Expected:** Validation error. Cannot advance.

### TC-3.4 Edit Organizer Profile (all fields)
**Steps:**
1. As organizer, go to `/organizer`
2. Click "Edit profile"
3. Change name, bio, avatar, cover, all social links, PAN, bank details
4. Save
**Expected:** All fields saved. KYC and bank fields all editable.

### TC-3.5 Cover Photo Crop (3:1 aspect)
**Steps:**
1. In edit organizer profile, click "Change cover"
2. Upload a wide image
3. Crop modal opens with 3:1 aspect ratio
4. Adjust and save
**Expected:** Cover photo updates with correct aspect ratio crop.

### TC-3.6 Public Organizer Profile
**Steps:**
1. Visit `/organizers/[id]` for a known organizer
2. Verify: banner, avatar, name, bio, verification badge (if verified), social links, About section, events list
**Expected:** Public profile resembles organizer dashboard layout. All sections render.

---

## SECTION 4 — Event Creation

### TC-4.1 Create FREE Event
**Steps:**
1. As organizer, go to `/organizer` → "Create" tab
2. Enter title "Free Test Event"
3. Select categories (multi-select chips), city
4. Enter venue name, venue address
5. Paste Google Maps link (or skip — should be optional now)
6. Set start date (future), end date (after start)
7. Select pricing mode: FREE
8. Enter total quantity: 50
9. Accept organizer terms
10. Submit
**Expected:** Event created as DRAFT. Success message. Event appears in organizer events list.

### TC-4.2 Create FLAT Price Event
**Steps:**
1. Same as above but select FLAT mode
2. Enter price: ₹500, quantity: 30
3. Submit
**Expected:** Event created with one paid tier at ₹500.

### TC-4.3 Create PAID Multi-Tier Event
**Steps:**
1. Select PAID mode
2. Add 3 tiers: Early Bird ₹300 qty 10, General ₹500 qty 20, VIP ₹1000 qty 5
3. Add perks to each tier
4. Submit
**Expected:** Event created with 3 tiers. Each tier has name, price, quantity, perks.

### TC-4.4 Create PHASED Pricing Event
**Steps:**
1. Select PHASED mode
2. Create Phase 1: opens tomorrow, closes in 3 days, price ₹300, qty 15
3. Create Phase 2: opens in 3 days, closes in 7 days, price ₹500, qty 10
4. Add optional named tier to Phase 1
5. Submit
**Expected:** Event created with 2 sequential phases. Phase 2 starts after Phase 1 ends.

### TC-4.5 Multi-Category Selection
**Steps:**
1. In event creation form, find "Categories (select all that apply)" section
2. Select multiple categories: "Hip Hop Parties" + "Jams & Gigs"
3. Submit the form
4. Open the event detail page
**Expected:** Event card shows multiple category badges. Event appears in both category filter chips on homepage.

### TC-4.6 Select "Hip Hop Parties" Category
**Steps:**
1. Create event, select only "Hip Hop Parties" category
2. Publish the event
3. Go to homepage, click "Hip Hop Parties" chip
**Expected:** Event appears in the filtered list.

### TC-4.7 Select "Car & Bike Meetups" Category
**Steps:**
1. Create event, select only "Car & Bike Meetups" category
2. Publish the event
3. Go to homepage, click "Car & Bike Meetups" chip
**Expected:** Event appears in the filtered list.

### TC-4.8 Past Start Date Rejected
**Steps:**
1. In event form, select start date = yesterday
**Expected:** Date picker prevents selection (min = now). If somehow submitted, server rejects.

### TC-4.9 End Date Before Start — Rejected
**Steps:**
1. Set start date = tomorrow 10 AM
2. Set end date = tomorrow 9 AM (before start)
3. Submit
**Expected:** Error: "End date and time must be after the start date and time."

### TC-4.10 End Date Empty — Rejected
**Steps:**
1. Leave end date empty
2. Submit
**Expected:** Error: "End date and time is required."

### TC-4.11 Negative Ticket Quantity — Rejected
**Steps:**
1. In tier quantity, try to enter -1
**Expected:** Browser prevents (min attribute). Server also rejects if bypassed.

### TC-4.12 Google Maps Link Optional
**Steps:**
1. Create event, leave Google Maps link empty
2. Use "Choose on map" option instead
3. Pick a location on the OpenStreetMap picker
4. Submit
**Expected:** Event created without Google Maps link. Lat/lng saved from map picker.

### TC-4.13 Invalid Google Maps Link
**Steps:**
1. Enter "https://example.com" as Google Maps link
**Expected:** Error: "Link must be a Google Maps URL."

### TC-4.14 Publish Event
**Steps:**
1. Go to organizer event dashboard for a DRAFT event
2. Click "Publish event"
**Expected:** Event status → PUBLISHED. Event appears on homepage.

### TC-4.15 Door Staff Hidden from Organizer
**Steps:**
1. Create a new event
2. Look for door staff option in the form
**Expected:** Door staff card/option is NOT visible in the event creation form.

---

## SECTION 5 — Event Discovery (Homepage)

### TC-5.1 Homepage Shows Published Events
**Steps:**
1. Visit homepage as any user
2. Check "All Events" section
**Expected:** Published events appear sorted by date. Postponed events in separate "Postponed Events" section.

### TC-5.2 City Filter
**Steps:**
1. Select a different city from the city dropdown
**Expected:** Events filtered to selected city.

### TC-5.3 Category Chip Filter — Single Category
**Steps:**
1. Click a category chip (e.g., "Jams & Gigs")
**Expected:** Only events in that category shown. URL updates to `/?category=JAM_GIG`.

### TC-5.4 Category Chip Filter — Hip Hop Parties
**Steps:**
1. Click "Hip Hop Parties" chip
**Expected:** Only events with HIP_HOP_PARTY in their categories array shown.

### TC-5.5 Category Chip Filter — Car & Bike Meetups
**Steps:**
1. Click "Car & Bike Meetups" chip
**Expected:** Only events with CAR_BIKE_MEET in their categories array shown.

### TC-5.6 Multi-Category Event Appears in Multiple Chips
**Steps:**
1. Create an event with categories ["HIP_HOP_PARTY", "JAM_GIG"]
2. Publish it
3. Click "Hip Hop Parties" chip → event should appear
4. Click "Jams & Gigs" chip → event should appear
5. Click "All" → event should appear only ONCE (no duplicates)
**Expected:** Event shows in both category filters, but only once in "All" view.

### TC-5.7 Search
**Steps:**
1. Type an event title in the search bar
2. Submit
**Expected:** Events matching the search term shown.

### TC-5.8 Event Detail Page
**Steps:**
1. Click an event card
**Expected:** Event detail page loads with:
- Banner (not half-screen on laptop — max 340px height)
- Gallery in 4-per-row grid on desktop, 2-per-row on mobile
- Description, venue, date/time, tiers, organizer info
- Social icons (IG/YT/X/FB/LinkedIn) if connected
- No horizontal scroll on mobile

### TC-5.9 Past Event (Completed)
**Steps:**
1. Click a completed/past event card (grayed out)
**Expected:** Event details shown read-only. "Completed" badge. Booking disabled. "Explore more [category] events" CTA links to `/?category=...`.

### TC-5.10 Postponed Event Badge
**Steps:**
1. Find a postponed event on homepage
**Expected:** Amber "Postponed" badge on card. Appears in "Postponed Events" section. Still clickable and bookable.

### TC-5.11 "Your Events Today"
**Steps:**
1. Book a ticket for an event happening today
2. Go to homepage
**Expected:** "Your Events Today" section shows the event with title, time, venue, tier name.

### TC-5.12 Popular Events — Per City Cap
**Steps:**
1. Ensure there are 6+ popular events in one city
2. Visit homepage for that city
3. Count popular events shown
**Expected:** Maximum 4 popular events shown (or whatever `max_popular_per_city` is set to). Events from other cities do NOT count toward this cap.

### TC-5.13 Sponsored Events — Per City Cap
**Steps:**
1. Ensure there are 6+ featured/sponsored events in one city
2. Visit homepage for that city
3. Count sponsored events shown
**Expected:** Maximum 4 sponsored events shown (or whatever `max_sponsored_per_city` is set to).

### TC-5.14 Event Card Shows Multiple Category Badges
**Steps:**
1. View an event card for a multi-category event
**Expected:** Up to 2 category badges shown on the card.

---

## SECTION 6 — Front Row Carousel (formerly Hero Boost)

### TC-6.1 Front Row Carousel Displays
**Steps:**
1. Visit homepage
2. Look for "Front Row" section (NOT "Hero Events" or "Hero Boost")
**Expected:** Section titled "Front Row" with a large banner carousel. No "Hero Boost" text anywhere on the page.

### TC-6.2 Front Row Auto-Rotates
**Steps:**
1. Stay on homepage with 2+ Front Row events
2. Wait 6 seconds without clicking
**Expected:** Carousel automatically advances to the next event.

### TC-6.3 Front Row Manual Navigation
**Steps:**
1. Click the right arrow button
2. Click the left arrow button
**Expected:** Carousel advances/goes back. Dots indicator updates.

### TC-6.4 Front Row Dot Indicators
**Steps:**
1. Click a specific dot
**Expected:** Carousel jumps to that slide.

### TC-6.5 Front Row Shows City Name
**Steps:**
1. Look at the bottom overlay of the Front Row banner
**Expected:** Venue name followed by city name (e.g., "Juhu Beach, Mumbai").

### TC-6.6 Front Row — No Events
**Steps:**
1. If no active Front Row boosts exist, visit homepage
**Expected:** Front Row section is hidden entirely. No empty section.

### TC-6.7 Front Row — Single Event
**Steps:**
1. If only 1 active Front Row boost exists
**Expected:** Banner shows, no auto-rotation, no dots, no arrows.

### TC-6.8 Front Row — No "Hero Boost" Wording
**Steps:**
1. Search the entire homepage for "Hero Boost" or "Hero Events" text
**Expected:** None found. Only "Front Row" is used.

---

## SECTION 7 — Booking & Checkout

### TC-7.1 Free RSVP
**Steps:**
1. As a user, open a FREE event
2. Click "RSVP now"
3. Enter name "Test Booker", phone "9876543210"
4. Select gender
5. Submit
**Expected:** Order auto-confirmed. Redirected to `/tickets?submitted=1`. Ticket appears in wallet with QR.

### TC-7.2 Free Event — No Commission, No Convenience Fee
**Steps:**
1. Book a free event
2. Check the order in the database
**Expected:** `commission_paise = 0`, `convenience_fee_paise = 0`, `organizer_payout_paise = 0`.

### TC-7.3 Paid Booking with UTR
**Steps:**
1. Open a PAID event
2. Click "Book now" on a tier
3. Enter name, phone, gender
4. Enter UTR reference (min 6 chars): "UTR123456"
5. Upload payment screenshot
6. Submit
**Expected:** Order created as PENDING_VERIFICATION. Redirected to `/tickets?submitted=1`. Order shows in wallet with "Pending" status.

### TC-7.4 Paid Booking — Fee Breakdown Visible
**Steps:**
1. Open checkout for a paid event (e.g., ₹500 tier)
2. Review the price breakdown
**Expected:** Shows: Ticket price, Convenience fee (2% = ₹10), Total (₹510). Label says "Convenience fee" not "Platform fee".

### TC-7.5 Paid Booking — Order Snapshots Fees
**Steps:**
1. Book a paid event with 10% commission, 2% convenience fee
2. Check the order record in DB
**Expected:** `commission_paise`, `convenience_fee_paise`, `organizer_payout_paise` are all populated with calculated values. These are snapshots — changing event settings later does NOT affect this order.

### TC-7.6 Phone Disclaimer Visible
**Steps:**
1. Open checkout form
**Expected:** Disclaimer text visible: "Please provide a correct phone number. The organizer may contact you for event details. Outsiderr is not responsible if the phone number you provide is incorrect."

### TC-7.7 Auto-Save Buyer Details to Profile
**Steps:**
1. Book a ticket with name "Auto Save Test", phone "9999999999", gender "Male"
2. Go to `/profile`
**Expected:** Profile name, phone, and gender updated to the values entered at checkout.

### TC-7.8 Checkout Email — Saved to Order Only
**Steps:**
1. At checkout, edit the email to a different one than profile email
2. Submit
3. Check `/profile` email
4. Check the order record
**Expected:** Profile email unchanged. Order's `buyer_email` has the checkout email.

### TC-7.9 Gender Prefilled at Checkout
**Steps:**
1. Set gender to "Female" in profile
2. Open checkout for any event
**Expected:** Gender field is pre-filled with "Female".

### TC-7.10 Double Booking Prevention
**Steps:**
1. Book a ticket for an event (free or paid)
2. Try to book the same event again
**Expected:** Error: "You have already booked a ticket for this event."

### TC-7.11 Sold-Out Tier
**Steps:**
1. Find a tier with 0 tickets remaining
2. Try to book
**Expected:** "Not enough tickets left" or waitlist option shown.

### TC-7.12 Inventory Decrements After Free Booking
**Steps:**
1. Note tier quantity before booking (e.g., 50)
2. Book 1 free ticket
3. Check organizer dashboard → analytics
**Expected:** Tickets sold = 1, remaining = 49.

### TC-7.13 Inventory Decrements After Paid Approval
**Steps:**
1. Book 1 paid ticket (PENDING_VERIFICATION)
2. Check inventory — should NOT have decremented yet
3. Organizer approves the order
4. Check inventory again
**Expected:** Inventory only decrements after approval. Tickets minted on approval.

### TC-7.14 Concurrent Booking Race (if testable)
**Steps:**
1. Open 2 browser sessions (different users)
2. Book the last available ticket simultaneously
**Expected:** One succeeds, one gets "Not enough tickets left".

---

## SECTION 8 — Order Verification (Organizer)

### TC-8.1 View Pending Orders
**Steps:**
1. As organizer, go to `/organizer` → "Verify" tab
**Expected:** Table of pending orders with attendee name, phone, event, tier, UTR, amount, proof thumbnail.

### TC-8.2 View Payment Proof
**Steps:**
1. Click "View" on a pending order's proof
**Expected:** Modal opens with full payment screenshot.

### TC-8.3 Approve Order
**Steps:**
1. Click "Approve" on a pending paid order
**Expected:** Order status → CONFIRMED. Tickets minted with QR. `quantity_sold` incremented. User sees ticket in wallet.

### TC-8.4 Reject Order with Custom Reason
**Steps:**
1. Click "Reject" on a pending order
2. Modal opens with textarea
3. Type: "UTR does not match our records. Please re-submit."
4. Confirm rejection
**Expected:** Order status → REJECTED. Custom reason saved. Waitlist auto-offer triggered if applicable.

### TC-8.5 Rejection Triggers Waitlist Offer
**Steps:**
1. Have a user on waitlist for the same tier
2. Reject an order for that tier
**Expected:** First waitlisted user auto-promoted to OFFERED. Notification created (WAITLIST_OFFER).

### TC-8.6 Payout Snapshot on Approval
**Steps:**
1. Approve a paid order with 10% commission
2. Check the order record
**Expected:** `organizer_payout_paise` = subtotal - commission. Values are snapshotted at approval time.

---

## SECTION 9 — Ticket Wallet & QR

### TC-9.1 View Tickets
**Steps:**
1. As user, go to `/tickets`
**Expected:** Two sections: "Passes" (confirmed tickets with QR) and "Orders" (all bookings with status).

### TC-9.2 Valid Ticket — Tap to Expand
**Steps:**
1. Tap a valid (confirmed, not scanned) ticket
**Expected:** Modal opens with large QR, tier name, date/time, venue, print button, download QR button.

### TC-9.3 Scanned Ticket
**Steps:**
1. Scan a ticket at the door (see Section 10)
2. Go to `/tickets`
**Expected:** Ticket shows "Scanned" badge. QR has "Scanned" overlay. Cannot tap to expand.

### TC-9.4 Expired Ticket
**Steps:**
1. Find a ticket for a past event
**Expected:** Ticket shows "Expired" badge. Grayed out. Cannot tap to open.

### TC-9.5 Cancelled Ticket
**Steps:**
1. Organizer cancels an event (see Section 13)
2. Go to `/tickets` as user
**Expected:** Ticket shows "Cancelled" badge. QR has "Cancelled" overlay. "Contact organizer for refund details" link visible (mailto).

### TC-9.6 Print Ticket
**Steps:**
1. Open a valid ticket
2. Click "Print ticket"
**Expected:** Opens `/tickets/[id]/print` with full ticket details + QR. Browser print dialog works. Back button visible.

---

## SECTION 10 — Door Scanner & Check-In

### TC-10.1 Start Scanner
**Steps:**
1. As organizer, go to event dashboard → "Scan" tab
2. Click "Start camera"
**Expected:** Camera activates. QR scanner running. Event name shown at top.

### TC-10.2 Valid Scan
**Steps:**
1. Show a valid confirmed ticket QR to camera
**Expected:** Green result: "VALID — Checked In". Shows:
- Event name
- Buyer name
- Buyer email
- Buyer phone
- Tier name
- Pax count (quantity)
- Check-in time
- High beep sound
- Scan counter increments

### TC-10.3 Duplicate Scan
**Steps:**
1. Scan the same QR again
**Expected:** Amber result: "ALREADY USED". Low beep. Shows attendee details again for cross-check.

### TC-10.4 Invalid QR
**Steps:**
1. Show a random/non-existent QR
**Expected:** Red result: "INVALID". Low beep.

### TC-10.5 Manual Hash Entry
**Steps:**
1. Type a valid QR hash manually
2. Click "Check in"
**Expected:** Same result as camera scan.

### TC-10.6 Recent Scans List
**Steps:**
1. After multiple scans, check recent scans
**Expected:** Last 10 scans shown with hash, holder name, outcome icon, timestamp.

---

## SECTION 11 — Attendees Management

### TC-11.1 View Attendees Table
**Steps:**
1. As organizer, open event dashboard
2. Scroll to attendees section
**Expected:** Table with buyer name, phone, email, tier, pax, total, status, UTR, date.

### TC-11.2 Filter — Confirmed
**Steps:**
1. Click "Confirmed" filter tab
**Expected:** Only confirmed orders shown. Count badge shows correct number.

### TC-11.3 Filter — Checked In
**Steps:**
1. Click "Checked In" filter tab
**Expected:** Only checked-in attendees shown.

### TC-11.4 Filter — Pending
**Steps:**
1. Click "Pending" filter tab
**Expected:** Only pending verification orders shown.

### TC-11.5 Print Attendee List
**Steps:**
1. Click "Print" button
**Expected:** Browser print dialog opens with the filtered attendee list.

### TC-11.6 Empty Attendees
**Steps:**
1. Open an event with no bookings
**Expected:** "No bookings yet." message.

---

## SECTION 12 — Waitlist

### TC-12.1 Join Waitlist
**Steps:**
1. As user, open a sold-out event
2. Click "Join Waitlist"
**Expected:** Waitlist entry created. Position number shown. "Leave" button available.

### TC-12.2 Leave Waitlist
**Steps:**
1. Click "Leave" on waitlist entry
**Expected:** Entry removed.

### TC-12.3 Waitlist Auto-Offer (on rejection)
**Steps:**
1. User A joins waitlist for sold-out tier
2. Organizer rejects an existing order for that tier
**Expected:** User A promoted to OFFERED. Notification created. 24h expiry set.

### TC-12.4 Waitlist Panel (Organizer)
**Steps:**
1. As organizer, open event dashboard
2. Find waitlist section
3. Click "View details"
**Expected:** Popup/modal opens showing all waitlisted users with: position, name, tier, status (Waiting/Offered/Expired), join date.

### TC-12.5 Waitlist First-Come-First-Served
**Steps:**
1. Users A, B, C join waitlist in order
2. A ticket becomes available
**Expected:** User A (position 1) gets the offer first, not B or C.

### TC-12.6 Expired Offer Recycled
**Steps:**
1. User A has an OFFERED entry with expired 24h window
2. Organizer opens event dashboard (triggers expireWaitlistOffers)
**Expected:** User A moved back to WAITING. User B (next in line) gets OFFERED.

---

## SECTION 13 — Event Cancellation & Postponement

### TC-13.1 Cancel Event
**Steps:**
1. As organizer, open a PUBLISHED event with confirmed bookings
2. Click "Cancel event"
3. Confirm in modal
**Expected:**
- Event status → CANCELLED
- All confirmed tickets marked CANCELLED
- Refund records created
- All ticket holders receive in-app notification
- Cancellation charge applied

### TC-13.2 Cancelled Ticket — User View
**Steps:**
1. As a user with a ticket for the cancelled event, go to `/tickets`
**Expected:**
- Ticket shows "Cancelled" badge
- QR has "Cancelled" overlay text
- "Contact organizer for refund details" link visible
- Cannot tap to expand

### TC-13.3 Postpone Event
**Steps:**
1. As organizer, open a PUBLISHED event
2. Click "Postpone event"
3. Enter new start date (future) and optional end date
4. Confirm
**Expected:**
- Event status → POSTPONED
- Ticket holders notified
- Postponement charge applied

### TC-13.4 Postponed Event on Homepage
**Steps:**
1. After postponing, visit homepage
**Expected:**
- Event appears in "Postponed Events" section (NOT in "All Events")
- Amber "Postponed" badge on card
- Event still clickable and bookable

### TC-13.5 Postponed Event — Past Date Rejected
**Steps:**
1. In postpone modal, try to select a past date for new start
**Expected:** Date picker prevents selection (min = now).

### TC-13.6 Republish Cancelled Event
**Steps:**
1. As organizer, open a CANCELLED event
2. Click "Republish"
3. Confirm
**Expected:** Event status → PUBLISHED. Event reappears on homepage.

---

## SECTION 14 — Notifications

### TC-14.1 Notification Bell Visible
**Steps:**
1. Sign in as any user
**Expected:** Bell icon visible in navbar. Unread count badge if > 0.

### TC-14.2 View Notifications
**Steps:**
1. Click bell icon
**Expected:** Dropdown shows notifications with type label, event title, message, timestamp. Unread items highlighted.

### TC-14.3 Mark as Read
**Steps:**
1. Click checkmark on a notification
**Expected:** Notification marked as read. Badge count decreases.

### TC-14.4 Mark All Read
**Steps:**
1. Click "Mark all read"
**Expected:** All notifications marked read. Badge disappears.

### TC-14.5 Outside Click Closes Dropdown
**Steps:**
1. Open notification dropdown
2. Click outside
**Expected:** Dropdown closes.

### TC-14.6 Event Change Notification (Venue)
**Steps:**
1. As organizer, edit an event with confirmed bookings
2. Change the venue name
3. Save
**Expected:** All ticket holders receive VENUE_CHANGE notification.

### TC-14.7 Event Change Notification (City)
**Steps:**
1. Change the city in edit event form
2. Save
**Expected:** All ticket holders receive CITY_CHANGE notification.

### TC-14.8 Event Change Notification (Time)
**Steps:**
1. Change the start date/time in edit event form
2. Save
**Expected:** All ticket holders receive TIME_CHANGE notification.

---

## SECTION 15 — Event Editing

### TC-15.1 Edit Event Details
**Steps:**
1. As organizer, open event dashboard → "Edit" tab
2. Change title, description, venue, city, categories, tags, social links, contact info
3. Save
**Expected:** All fields saved. Changes to venue/city/time trigger notifications.

### TC-15.2 Edit Multi-Category
**Steps:**
1. Open edit form for an event with categories ["HIP_HOP_PARTY"]
2. Add "Jams & Gigs" category (check the chip)
3. Remove "Hip Hop Parties" category (uncheck the chip)
4. Save
5. Reload the edit form
**Expected:** Only "Jams & Gigs" is checked. Categories updated correctly.

### TC-15.3 Edit Ticket Tiers
**Steps:**
1. Change tier name and price
2. Try to reduce quantity below sold count
**Expected:** Error: "Quantity for [tier] cannot be less than [sold] (already sold)."

### TC-15.4 Remove Tier with Sales — Blocked
**Steps:**
1. Try to remove a tier that has sold tickets
**Expected:** Delete button not shown for tiers with sales.

### TC-15.5 Remove Tier without Sales — Allowed
**Steps:**
1. Remove a tier with 0 sales
**Expected:** Tier deleted.

### TC-15.6 Edit Phase Dates
**Steps:**
1. For a FLAT_PHASE tier, change phase opens/closes dates
2. Try to set opening date in the past
**Expected:** Date picker prevents past dates (min = now).

### TC-15.7 Phase Sequential Validation (Server)
**Steps:**
1. Set Phase 2 opens-at before Phase 1 closes-at
2. Save
**Expected:** Server error: "Phase [name] must open after the previous phase ends."

### TC-15.8 Completed Event — Read-Only
**Steps:**
1. Open a completed event dashboard
**Expected:**
- Edit form hidden
- Front Row panel hidden
- Cancel/postpone hidden
- Door staff hidden
- Only gallery manager visible (with delete-on-hover)

### TC-15.9 Gallery Photo Deletion (Past Event)
**Steps:**
1. In past event gallery manager, hover over a photo
2. Click delete icon
**Expected:** Photo deleted from gallery. Other photos remain.

---

## SECTION 16 — Phased Pricing Logic

### TC-16.1 Only Active Phase Shown (User View)
**Steps:**
1. As user, open a phased event detail page
**Expected:** Only the currently active phase shown with "Current pricing" badge and closing date. Full phase timeline hidden. Carry-forward info hidden.

### TC-16.2 No Active Phase
**Steps:**
1. Open a phased event where all phases are closed/sold-out
**Expected:** "All phases sold out" message. Waitlist option shown.

### TC-16.3 Named Tiers Optional
**Steps:**
1. As organizer, create a phased event without named tiers
**Expected:** Event created successfully. Phases work without named tiers.

### TC-16.4 Phase 2 Opens When Phase 1 Sells Out
**Steps:**
1. Create phased event: Phase 1 qty 2, Phase 2 qty 5
2. Publish the event
3. Book 2 tickets (fill Phase 1)
4. Reload the event page
**Expected:** Phase 2 is now active. Phase 1 shows as sold out.

### TC-16.5 Phase 2 Opens When Phase 1 Closes by Time
**Steps:**
1. Create phased event: Phase 1 closes in 1 minute, Phase 2 after
2. Wait for Phase 1 to close
3. Reload event page
**Expected:** Phase 2 becomes active immediately when Phase 1 closes.

### TC-16.6 Unsold Inventory Carries Forward
**Steps:**
1. Create phased event: Phase 1 qty 10, Phase 2 qty 5
2. Book 3 tickets in Phase 1 (7 unsold)
3. Wait for Phase 1 to close
4. Check Phase 2 available quantity
**Expected:** Phase 2 has 5 + 7 = 12 tickets available (carry-forward).

---

## SECTION 17 — Front Row (Organizer Side)

### TC-17.1 Front Row Panel Visible
**Steps:**
1. As organizer, open an active (not cancelled, not past) event dashboard
2. Look for Front Row panel
**Expected:** Panel titled "Front Row" (NOT "Hero Boost"). Shows price, duration, "Feature My Event" button.

### TC-17.2 No "Hero Boost" Text in Organizer UI
**Steps:**
1. Search the entire organizer dashboard and event detail page for "Hero Boost"
**Expected:** No "Hero Boost" text found. Only "Front Row" is used.

### TC-17.3 Purchase Front Row
**Steps:**
1. Click "Feature My Event"
2. Verify boost order created
3. Enter UTR and submit
**Expected:** Status changes to "Payment Pending". UPI QR and instructions shown.

### TC-17.4 Front Row — Active State
**Steps:**
1. After admin approves the Front Row boost
2. Open the event dashboard
**Expected:** Panel shows "Front Row — Active" with start time, expiry time, amount paid.

### TC-17.5 Front Row — Past Event Hidden
**Steps:**
1. Open an event that has already started
**Expected:** Front Row panel shows "Front Row is not available for events that have already started." with reduced opacity.

### TC-17.6 Front Row — Cancelled Event Hidden
**Steps:**
1. Open a cancelled event dashboard
**Expected:** Front Row panel not shown.

---

## SECTION 18 — Admin Panel

### TC-18.1 Admin Dashboard
**Steps:**
1. Sign in as admin
2. Visit `/admin`
**Expected:** Overview with total events, live events, total orders, pending orders, gross revenue, platform fee, net payouts, active boosts, pending Front Row (labeled "Front Row pending", NOT "Hero pending").

### TC-18.2 Admin — Event Management
**Steps:**
1. Visit `/admin/events`
**Expected:** All events listed. Can feature/unfeature, change status.

### TC-18.3 Admin — Inline Commission Edit
**Steps:**
1. On `/admin/events`, find a paid event
2. Change commission from 10% to 7%
3. Enter reason: "Special organizer agreement"
4. Save
**Expected:** Commission saved. Audit log entry created with old value (1000 bps), new value (700 bps), admin ID, reason, timestamp.

### TC-18.4 Admin — Disable Commission for Event
**Steps:**
1. On an event, toggle commission "off"
2. Enter reason
3. Save
**Expected:** `commission_enabled = false`. Future orders for this event have zero commission.

### TC-18.5 Admin — Convenience Fee Edit
**Steps:**
1. On an event, change convenience fee from 2% to 1%
2. Enter reason
3. Save
**Expected:** Convenience fee saved. Audit log entry created.

### TC-18.6 Admin — Disable Convenience Fee
**Steps:**
1. Toggle convenience fee "off" for an event
2. Enter reason
3. Save
**Expected:** `convenience_fee_enabled = false`. Future orders have zero convenience fee.

### TC-18.7 Admin — Audit Log Verification
**Steps:**
1. Make several fee changes
2. Query `admin_change_log` table
**Expected:** Each change has: admin_id, field changed, old value, new value, reason, timestamp, event_id. No entries missing.

### TC-18.8 Admin — Order Management
**Steps:**
1. Visit `/admin/orders`
**Expected:** All orders across all events listed.

### TC-18.9 Admin — User Management
**Steps:**
1. Visit `/admin/users`
**Expected:** All users listed. Can toggle admin/organizer flags.

### TC-18.10 Admin — Front Row Approval
**Steps:**
1. Visit `/admin/boosts`
2. Section labeled "Front Row" (NOT "Hero Boosts")
3. Approve a pending Front Row boost
**Expected:** Boost status updated. Event featured in homepage Front Row carousel.

### TC-18.11 Admin — Settings: Popular/Sponsored Caps
**Steps:**
1. Visit `/admin/settings`
2. Find "Max popular events per city" field
3. Change from 4 to 3
4. Find "Max sponsored events per city" field
5. Change from 4 to 2
6. Save
7. Visit homepage
**Expected:** Popular events capped at 3 per city. Sponsored events capped at 2 per city.

### TC-18.12 Admin — Settings: Default Commission
**Steps:**
1. In admin settings, find "Default commission (bps)" field
2. Change from 1000 to 800
3. Save
4. Create a new paid event
5. Check the event's commission_bps
**Expected:** New event has commission_bps = 800 (8%).

### TC-18.13 Admin — Settings: Default Convenience Fee
**Steps:**
1. In admin settings, find "Default convenience fee (bps)" field
2. Change from 200 to 300
3. Save
4. Create a new paid event
5. Check the event's convenience_fee_bps
**Expected:** New event has convenience_fee_bps = 300 (3%).

### TC-18.14 Admin — Settings: Front Row Labels
**Steps:**
1. In admin settings, find "Boosts & Front Row" section
2. Verify labels say "Front Row" not "Hero Boost"
**Expected:** All labels updated: "Front Row enabled", "Front Row price", "Front Row duration", "Max visible Front Row events".

### TC-18.15 Admin — Door Staff Still Available
**Steps:**
1. Visit `/admin`
2. Look for Door Staff in admin navigation
3. Visit the admin Door Staff page
**Expected:** Door Staff is accessible in admin. NOT hidden from admin.

### TC-18.16 Admin — Clubs Still Available
**Steps:**
1. Visit `/admin`
2. Look for Clubs in admin navigation
3. Visit the admin Clubs page
**Expected:** Clubs management is accessible in admin. NOT hidden from admin.

### TC-18.17 Admin — Event Edit (Date Validation)
**Steps:**
1. Visit `/admin/events`
2. Edit an event
3. Try to set start date in the past
**Expected:** Date picker prevents past dates (min = now).

### TC-18.18 Admin — Featured/Sponsored Toggle
**Steps:**
1. On `/admin/events`, toggle "featured" for an event
2. Visit homepage
**Expected:** Event appears in sponsored section (if within cap).

---

## SECTION 19 — Release Scope: Hidden Features

### TC-19.1 Door Staff Hidden from Organizer Event Form
**Steps:**
1. As organizer, create a new event
2. Look for door staff option
**Expected:** Door staff card/option NOT visible.

### TC-19.2 Door Staff Hidden from Organizer Event Detail
**Steps:**
1. As organizer, open an event dashboard
2. Look for door staff section
**Expected:** Door staff section NOT visible.

### TC-19.3 Door Staff Hidden from User Pages
**Steps:**
1. As user, browse event detail pages
2. Look for any door staff references
**Expected:** No door staff references visible.

### TC-19.4 Door Staff Visible in Admin
**Steps:**
1. As admin, visit `/admin`
2. Check navigation for Door Staff
3. Visit the Door Staff admin page
**Expected:** Door Staff fully accessible in admin.

### TC-19.5 Join a Club/Crew Hidden from Homepage
**Steps:**
1. Visit homepage
2. Look for "Join a Club" or "Join a Crew" button/link
**Expected:** NOT visible.

### TC-19.6 Join a Club/Crew Hidden from Footer
**Steps:**
1. Scroll to footer
2. Look for "Join a Club / Crew" link
**Expected:** NOT visible.

### TC-19.7 Clubs Hidden from Organizer Tabs
**Steps:**
1. As organizer, go to `/organizer`
2. Look for "Clubs & Crews" tab
**Expected:** NOT visible.

### TC-19.8 Clubs Hidden from List Your Event
**Steps:**
1. Visit `/list-your-event`
2. Look for Clubs & Crews feature card
**Expected:** NOT visible. No mention of clubs/crews as an organizer feature.

### TC-19.9 Clubs Visible in Admin
**Steps:**
1. As admin, visit `/admin`
2. Check navigation for Clubs
3. Visit the Clubs admin page
**Expected:** Clubs management fully accessible in admin.

---

## SECTION 20 — List Your Event Page

### TC-20.1 Free Listing Messaging
**Steps:**
1. Visit `/list-your-event`
2. Read the page content
**Expected:** Page says listing is free. Says a negligible fraction is charged only when organizers actually sell. Does NOT show explicit commission percentage (e.g., "10% commission").

### TC-20.2 Value Proposition Cards
**Steps:**
1. Scroll through the page
**Expected:** Feature cards highlighting: QR scanner, analytics, trends, insights, attendee list, bookings, attendance/no-shows, ticketing, inventory, notifications, event management.

### TC-20.3 Hip Hop Parties in Chips
**Steps:**
1. Scroll to "Built for rawness" section
2. Look for hip hop related chips
**Expected:** "Hip hop parties", "Trap nights", "Boom bap nights" chips visible.

### TC-20.4 Car & Bike Meetups in Chips
**Steps:**
1. In the same section, look for car/bike related chips
**Expected:** "Car & bike meetups", "JDM meets", "Superbike meets", "Riders meets" chips visible.

### TC-20.5 No Clubs & Crews Mention
**Steps:**
1. Search the entire page for "club" or "crew"
**Expected:** No mention of clubs or crews as an organizer feature.

### TC-20.6 Front Row Mention (not Hero Boost)
**Steps:**
1. Search the page for "Hero Boost"
2. Search for "Front Row"
**Expected:** No "Hero Boost" text. "Front Row" may be mentioned as a feature.

### TC-20.7 CTA Works
**Steps:**
1. Click "Get Started" button
**Expected:** Navigates to `/organizer`.

---

## SECTION 21 — Organizer Dashboard

### TC-21.1 Events List with Sorting
**Steps:**
1. Go to `/organizer` → "Events" tab
2. Try each sort option: Latest, Alphabetical, Popularity, Waitlist, Revenue
3. Toggle ascending/descending
**Expected:** Events re-sort correctly for each option.

### TC-21.2 Status Badges
**Steps:**
1. Check events with different statuses
**Expected:** Correct badges: Live (green), Draft (gray), Postponed (violet), Cancelled (red), Completed (gray).

### TC-21.3 Aggregated Analytics
**Steps:**
1. Go to "Analytics" tab
**Expected:**
- Aggregate stat cards: total events, orders, confirmed, tickets sold, revenue, payout, check-ins, no-shows, waitlist
- Bar charts for attendance and order status
- Revenue-by-event horizontal bars

### TC-21.4 Per-Event Analytics
**Steps:**
1. Scroll below aggregated section
**Expected:** Each event shows: total orders, confirmed, revenue, payout, tickets sold, capacity %, check-ins, waitlist count.

### TC-21.5 Print Report
**Steps:**
1. Click "Print report" for an event
2. On report page, click "Print"
**Expected:** Report page with revenue summary, confirmed orders, attendee check-ins. Browser print dialog works. Back button visible.

---

## SECTION 22 — Image Handling

### TC-22.1 Profile Avatar Crop (1:1)
**Steps:**
1. Upload avatar in profile edit
2. Crop modal opens with square aspect
3. Zoom, pan, crop
**Expected:** Cropped square image saved.

### TC-22.2 Organizer Cover Crop (3:1)
**Steps:**
1. Upload cover in organizer profile edit
2. Crop modal opens with 3:1 aspect
**Expected:** Cropped wide image saved.

### TC-22.3 Event Card Poster Upload
**Steps:**
1. In event creation, upload a card poster (2:3 aspect)
2. Crop modal opens
3. Save
**Expected:** Cropped card poster saved. Shows on event card.

### TC-22.4 Event Banner Poster Upload
**Steps:**
1. In event creation, upload a banner poster (21:9 aspect)
2. Crop modal opens
3. Save
**Expected:** Cropped banner poster saved. Shows on event detail and Front Row.

### TC-22.5 Event Gallery Upload
**Steps:**
1. In event creation/edit, upload multiple gallery photos
**Expected:** Photos uploaded. Gallery shows in 4-per-row grid on public page.

---

## SECTION 23 — Edge Cases

### TC-23.1 No Events in City
**Steps:**
1. Select a city with no events
**Expected:** "No events in [city] right now" message. Other cities suggested.

### TC-23.2 Organizer with No Events
**Steps:**
1. New organizer opens dashboard
**Expected:** "No events yet. Create your first event." with link.

### TC-23.3 Checkout — Missing Name
**Steps:**
1. Submit checkout form without name
**Expected:** Browser `required` blocks submission.

### TC-23.4 Checkout — Missing UTR (Paid)
**Steps:**
1. Submit paid checkout without UTR
**Expected:** Browser `required` blocks submission.

### TC-23.5 Mobile — No Horizontal Scroll
**Steps:**
1. Open app on mobile (or devtools mobile view)
2. Browse homepage, event detail, checkout, tickets, organizer dashboard
**Expected:** No horizontal scroll on any page.

### TC-23.6 Console Errors
**Steps:**
1. Open browser devtools console
2. Browse: homepage, event detail, checkout, tickets, organizer dashboard, admin panel
3. Check for red errors
**Expected:** No console errors on any page.

### TC-23.7 No "Hero Boost" Text Anywhere (User-Facing)
**Steps:**
1. Search every user-facing and organizer-facing page for "Hero Boost"
2. Check: homepage, event detail, organizer dashboard, event form, list-your-event, profile, tickets
**Expected:** No "Hero Boost" text anywhere. Only "Front Row" is used.
**Exception:** Admin settings may still use internal key names like `hero_boost_enabled` but labels should say "Front Row".

---

## SECTION 24 — User Menu & Navigation

### TC-24.1 User Menu Outside Click
**Steps:**
1. Click user avatar (top-right)
2. Click outside the dropdown
**Expected:** Dropdown closes.

### TC-24.2 User Menu Escape Key
**Steps:**
1. Open user menu
2. Press Escape
**Expected:** Dropdown closes.

### TC-24.3 Back Button — Print Report
**Steps:**
1. On `/organizer/events/[id]/report`, click "Back to event"
**Expected:** Returns to event management page.

### TC-24.4 Back Button — Print Ticket
**Steps:**
1. On `/tickets/[id]/print`, click "Back to tickets"
**Expected:** Returns to `/tickets`.

---

## CRITICAL PATH — End-to-End Flow (PAID Event)

This is the single most important test. Run it in order:

### Step 1: Organizer Creates Event
1. Sign in as organizer
2. Create a PAID event with 2 tiers (Early Bird ₹300 qty 5, General ₹500 qty 10)
3. Select categories: "Hip Hop Parties" + "Jams & Gigs"
4. Publish the event

### Step 2: User Discovers Event
5. Sign in as user (different account)
6. Find the event on homepage
7. Verify: event appears in both "Hip Hop Parties" and "Jams & Gigs" chip filters
8. Verify: event appears only ONCE in "All" view
9. Open event detail page
10. Verify: tiers and pricing shown correctly
11. Verify: two category badges on the card

### Step 3: User Books Ticket
12. Click "Book now" on Early Bird tier
13. Enter name, phone, gender, UTR, payment screenshot
14. Verify: checkout shows "Convenience fee" (2% = ₹6) and total = ₹306
15. Submit → order PENDING_VERIFICATION

### Step 4: Organizer Verifies Payment
16. Sign in as organizer
17. Go to "Verify" tab
18. Approve the order

### Step 5: Verify Ticket Generated
19. Sign in as user
20. Go to `/tickets`
21. Verify: ticket appears in "Passes" with QR code
22. Verify: status is "Valid"

### Step 6: Verify Inventory Decremented
23. As organizer, check event analytics
24. Verify: tickets sold = 1, remaining = 4 for Early Bird

### Step 7: Verify Fee Snapshot
25. Check the order record in DB
26. Verify: `commission_paise` = 30 (10% of ₹300), `convenience_fee_paise` = 6 (2% of ₹300), `organizer_payout_paise` = 270

### Step 8: Door Scanner Check-In
27. As organizer, open event scan page
28. Scan the user's QR code
29. Verify: "VALID — Checked In", shows name, email, phone, pax, event name

### Step 9: Verify Checked-In State
30. As user, go to `/tickets`
31. Verify: ticket now shows "Scanned" badge

### Step 10: Verify Attendee Table
32. As organizer, open event dashboard
33. Check attendees table → "Checked In" filter
34. Verify: the user appears with check-in time

### Step 11: Print Report
35. Click "Print report"
36. Verify: report shows confirmed orders, check-ins, revenue summary

**If all 11 steps pass, the critical path is working.**

---

## CRITICAL PATH — End-to-End Flow (FREE Event)

### Step 1: Organizer Creates FREE Event
1. Sign in as organizer
2. Create a FREE event, qty 50
3. Select category: "Car & Bike Meetups"
4. Publish the event

### Step 2: User Books
5. Sign in as user
6. Find the event (check "Car & Bike Meetups" chip)
7. Click "RSVP now"
8. Enter name, phone, gender
9. Submit → auto-confirmed

### Step 3: Verify No Fees
10. Check the order record in DB
11. Verify: `commission_paise = 0`, `convenience_fee_paise = 0`, `organizer_payout_paise = 0`

### Step 4: Verify Ticket
12. Go to `/tickets`
13. Verify: ticket appears in "Passes" with QR

### Step 5: Verify Inventory
14. As organizer, check analytics
15. Verify: tickets sold = 1, remaining = 49

**If all 5 steps pass, the free event critical path is working.**

---

## CRITICAL PATH — Admin Fee Override

### Step 1: Admin Changes Commission
1. Sign in as admin
2. Go to `/admin/events`
3. Find a paid event
4. Change commission from 10% to 5%
5. Enter reason: "Loyalty discount for organizer"
6. Save

### Step 2: Verify Audit Log
7. Query `admin_change_log` table
8. Verify: entry exists with old_value=1000, new_value=500, reason="Loyalty discount for organizer", admin_id set

### Step 3: New Booking Uses Updated Commission
9. As user, book a ticket for that event
10. Organizer approves
11. Check order record
12. Verify: `commission_paise` reflects 5% (not 10%)

### Step 4: Old Orders Unaffected
13. Check an order placed BEFORE the commission change
14. Verify: its `commission_paise` still reflects the old 10% rate

**If all 4 steps pass, the admin fee override is working.**

---

## CRITICAL PATH — Front Row Purchase

### Step 1: Organizer Purchases Front Row
1. Sign in as organizer
2. Open an active event dashboard
3. Find "Front Row" panel (NOT "Hero Boost")
4. Click "Feature My Event"
5. Enter UTR, submit

### Step 2: Admin Approves
6. Sign in as admin
7. Go to `/admin/boosts`
8. Find the pending Front Row request
9. Click "Verify & Activate"

### Step 3: Verify on Homepage
10. Visit homepage
11. Verify: event appears in "Front Row" carousel
12. Verify: city name shown in the banner overlay
13. Verify: no "Hero Boost" text anywhere

### Step 4: Auto-Rotation
14. If 2+ events in Front Row, wait 6 seconds
15. Verify: carousel auto-advances

**If all 4 steps pass, the Front Row flow is working.**

---

## CRITICAL PATH — Phased Ticketing

### Step 1: Create Phased Event
1. As organizer, create a PHASED event
2. Phase 1: opens now, closes in 5 min, qty 2, price ₹300
3. Phase 2: opens after Phase 1, closes in 1 hour, qty 5, price ₹500
4. Publish

### Step 2: Book Phase 1
5. As user, book 2 tickets (fill Phase 1)
6. Reload event page
7. Verify: Phase 2 is now active

### Step 3: Verify Carry-Forward
8. Check Phase 2 available quantity
9. Verify: 5 (original) + 0 unsold from Phase 1 = 5 (since all sold)

### Step 4: Phase Close by Time
10. Create another phased event: Phase 1 qty 10, Phase 2 qty 5
11. Book 3 tickets in Phase 1 (7 unsold)
12. Wait for Phase 1 to close
13. Reload
14. Verify: Phase 2 active with 5 + 7 = 12 available

**If all 4 steps pass, phased ticketing is working.**

---

## Test Results Template

| TC # | Scenario | Status | Notes |
|------|----------|--------|-------|
| 1.1 | Sign up | | |
| 1.2 | Sign in | | |
| ... | ... | | |

**Status values:** PASS / FAIL / BLOCKED / SKIP

---

## Quick Checklist (Run Before Every Release)

- [ ] `npx next build` passes with zero errors
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No console errors on homepage, event detail, checkout, tickets, organizer, admin
- [ ] No "Hero Boost" text in user/organizer UI (only "Front Row")
- [ ] No "Join a Club / Crew" in user/organizer UI
- [ ] No door staff in organizer event form
- [ ] Door staff and Clubs accessible in admin
- [ ] Free events: no commission, no convenience fee
- [ ] Paid events: commission + convenience fee calculated and snapshotted
- [ ] Admin fee changes logged to audit table
- [ ] Front Row carousel shows, auto-rotates, shows city name
- [ ] Multi-category events appear in all selected category chips, no duplicates in "All"
- [ ] "Hip Hop Parties" and "Car & Bike Meetups" chips visible and functional
- [ ] Popular events capped per city (default 4)
- [ ] Sponsored events capped per city (default 4)
- [ ] Phased events: next phase opens on sellout or time close, carry-forward works
- [ ] Checkout: gender prefilled, saved to profile, email saved to order only
- [ ] No horizontal scroll on mobile
