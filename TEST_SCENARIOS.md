# Outsiderr — Full App Test Scenarios & Test Cases

## How to use this document
- Run each test in order — later tests depend on earlier ones
- Mark each as PASS / FAIL / BLOCKED
- For FAIL, note the actual behavior and screenshot if possible
- Prerequisites: Supabase running, `fix_all.sql` applied, `.env` configured

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
**Expected:** Each redirects to `/login?next=...` with return URL.

### TC-1.5 Wrong Password
**Steps:**
1. Go to `/login`
2. Enter valid email + wrong password
3. Submit
**Expected:** Error message "Invalid login credentials". Stays on login page.

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

### TC-2.2 Upload Profile Image with Crop
**Steps:**
1. On `/profile`, click "Upload" under profile photo
2. Select an image file
3. Crop modal opens
4. Drag to reposition, zoom in/out
5. Click "Crop & Save"
**Expected:** Cropped image uploaded. Profile photo updates. No uncropped original shown.

### TC-2.3 Add Social Links
**Steps:**
1. On `/profile`, scroll to social links section
2. Enter Instagram URL: `https://instagram.com/testuser`
3. Enter YouTube URL: `https://youtube.com/@testuser`
4. Enter X URL: `https://x.com/testuser`
5. Enter Facebook URL: `https://facebook.com/testuser`
6. Enter LinkedIn URL: `https://linkedin.com/in/testuser`
7. Save
**Expected:** All 5 social links saved. No errors.

### TC-2.4 Birthdate — No Future Dates
**Steps:**
1. On `/profile`, click birthdate field
2. Try to select a date after today
**Expected:** Calendar does not allow selecting future dates (max = today).

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

---

## SECTION 4 — Event Creation

### TC-4.1 Create FREE Event
**Steps:**
1. As organizer, go to `/organizer` → "Create" tab
2. Enter title "Free Test Event"
3. Select category, city
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

### TC-4.5 Past Start Date Rejected
**Steps:**
1. In event form, select start date = yesterday
**Expected:** Date picker prevents selection (min = now). If somehow submitted, server rejects.

### TC-4.6 End Date Before Start — Rejected
**Steps:**
1. Set start date = tomorrow 10 AM
2. Set end date = tomorrow 9 AM (before start)
3. Submit
**Expected:** Error: "End date and time must be after the start date and time."

### TC-4.7 End Date Empty — Rejected
**Steps:**
1. Leave end date empty
2. Submit
**Expected:** Error: "End date and time is required."

### TC-4.8 Negative Ticket Quantity — Rejected
**Steps:**
1. In tier quantity, try to enter -1
**Expected:** Browser prevents (min attribute). Server also rejects if bypassed.

### TC-4.9 Google Maps Link Optional
**Steps:**
1. Create event, leave Google Maps link empty
2. Use "Choose on map" option instead
3. Pick a location on the OpenStreetMap picker
4. Submit
**Expected:** Event created without Google Maps link. Lat/lng saved from map picker.

### TC-4.10 Invalid Google Maps Link
**Steps:**
1. Enter "https://example.com" as Google Maps link
**Expected:** Error: "Link must be a Google Maps URL."

### TC-4.11 Publish Event
**Steps:**
1. Go to organizer event dashboard for a DRAFT event
2. Click "Publish event"
**Expected:** Event status → PUBLISHED. Event appears on homepage.

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

### TC-5.3 Category Chip Filter
**Steps:**
1. Click a category chip (e.g., "Jam & Gig")
**Expected:** Only events in that category shown. URL updates to `/?category=JAM_GIG`.

### TC-5.4 Search
**Steps:**
1. Type an event title in the search bar
2. Submit
**Expected:** Events matching the search term shown.

### TC-5.5 Event Detail Page
**Steps:**
1. Click an event card
**Expected:** Event detail page loads with:
- Banner (not half-screen on laptop — max 340px height)
- Gallery in 4-per-row grid on desktop, 2-per-row on mobile
- Description, venue, date/time, tiers, organizer info
- Social icons (IG/YT/X/FB/LinkedIn) if connected
- No horizontal scroll on mobile

### TC-5.6 Past Event (Completed)
**Steps:**
1. Click a completed/past event card (grayed out)
**Expected:** Event details shown read-only. "Completed" badge. Booking disabled. "Explore more [category] events" CTA links to `/?category=...`.

### TC-5.7 Postponed Event Badge
**Steps:**
1. Find a postponed event on homepage
**Expected:** Amber "Postponed" badge on card. Appears in "Postponed Events" section. Still clickable and bookable.

### TC-5.8 "Your Events Today"
**Steps:**
1. Book a ticket for an event happening today
2. Go to homepage
**Expected:** "Your Events Today" section shows the event with title, time, venue, tier name.

---

## SECTION 6 — Booking & Checkout

### TC-6.1 Free RSVP
**Steps:**
1. As a user, open a FREE event
2. Click "RSVP now"
3. Enter name "Test Booker", phone "9876543210"
4. Submit
**Expected:** Order auto-confirmed. Redirected to `/tickets?submitted=1`. Ticket appears in wallet with QR.

### TC-6.2 Paid Booking with UTR
**Steps:**
1. Open a PAID event
2. Click "Book now" on a tier
3. Enter name, phone
4. Enter UTR reference (min 6 chars): "UTR123456"
5. Upload payment screenshot
6. Submit
**Expected:** Order created as PENDING_VERIFICATION. Redirected to `/tickets?submitted=1`. Order shows in wallet with "Pending" status.

### TC-6.3 Phone Disclaimer Visible
**Steps:**
1. Open checkout form
**Expected:** Disclaimer text visible: "Please provide a correct phone number. The organizer may contact you for event details. Outsiderr is not responsible if the phone number you provide is incorrect."

### TC-6.4 Auto-Save Buyer Details to Profile
**Steps:**
1. Book a ticket with name "Auto Save Test", phone "9999999999"
2. Go to `/profile`
**Expected:** Profile name and phone updated to the values entered at checkout.

### TC-6.5 Double Booking Prevention
**Steps:**
1. Book a ticket for an event (free or paid)
2. Try to book the same event again
**Expected:** Error: "You have already booked a ticket for this event."

### TC-6.6 Sold-Out Tier
**Steps:**
1. Find a tier with 0 tickets remaining
2. Try to book
**Expected:** "Not enough tickets left" or waitlist option shown.

### TC-6.7 Inventory Decrements After Free Booking
**Steps:**
1. Note tier quantity before booking (e.g., 50)
2. Book 1 free ticket
3. Check organizer dashboard → analytics
**Expected:** Tickets sold = 1, remaining = 49.

### TC-6.8 Concurrent Booking Race (if testable)
**Steps:**
1. Open 2 browser sessions (different users)
2. Book the last available ticket simultaneously
**Expected:** One succeeds, one gets "Not enough tickets left".

---

## SECTION 7 — Order Verification (Organizer)

### TC-7.1 View Pending Orders
**Steps:**
1. As organizer, go to `/organizer` → "Verify" tab
**Expected:** Table of pending orders with attendee name, phone, event, tier, UTR, amount, proof thumbnail.

### TC-7.2 View Payment Proof
**Steps:**
1. Click "View" on a pending order's proof
**Expected:** Modal opens with full payment screenshot.

### TC-7.3 Approve Order
**Steps:**
1. Click "Approve" on a pending paid order
**Expected:** Order status → CONFIRMED. Tickets minted with QR. `quantity_sold` incremented. User sees ticket in wallet.

### TC-7.4 Reject Order with Custom Reason
**Steps:**
1. Click "Reject" on a pending order
2. Modal opens with textarea
3. Type: "UTR does not match our records. Please re-submit."
4. Confirm rejection
**Expected:** Order status → REJECTED. Custom reason saved. Waitlist auto-offer triggered if applicable.

### TC-7.5 Rejection Triggers Waitlist Offer
**Steps:**
1. Have a user on waitlist for the same tier
2. Reject an order for that tier
**Expected:** First waitlisted user auto-promoted to OFFERED. Notification created (WAITLIST_OFFER).

---

## SECTION 8 — Ticket Wallet & QR

### TC-8.1 View Tickets
**Steps:**
1. As user, go to `/tickets`
**Expected:** Two sections: "Passes" (confirmed tickets with QR) and "Orders" (all bookings with status).

### TC-8.2 Valid Ticket — Tap to Expand
**Steps:**
1. Tap a valid (confirmed, not scanned) ticket
**Expected:** Modal opens with large QR, tier name, date/time, venue, print button, download QR button.

### TC-8.3 Scanned Ticket
**Steps:**
1. Scan a ticket at the door (see Section 9)
2. Go to `/tickets`
**Expected:** Ticket shows "Scanned" badge. QR has "Scanned" overlay. Cannot tap to expand.

### TC-8.4 Expired Ticket
**Steps:**
1. Find a ticket for a past event
**Expected:** Ticket shows "Expired" badge. Grayed out. Cannot tap to open.

### TC-8.5 Cancelled Ticket
**Steps:**
1. Organizer cancels an event (see Section 12)
2. Go to `/tickets` as user
**Expected:** Ticket shows "Cancelled" badge. QR has "Cancelled" overlay. "Contact organizer for refund details" link visible (mailto).

### TC-8.6 Print Ticket
**Steps:**
1. Open a valid ticket
2. Click "Print ticket"
**Expected:** Opens `/tickets/[id]/print` with full ticket details + QR. Browser print dialog works. Back button visible.

---

## SECTION 9 — Door Scanner & Check-In

### TC-9.1 Start Scanner
**Steps:**
1. As organizer, go to event dashboard → "Scan" tab
2. Click "Start camera"
**Expected:** Camera activates. QR scanner running. Event name shown at top.

### TC-9.2 Valid Scan
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

### TC-9.3 Duplicate Scan
**Steps:**
1. Scan the same QR again
**Expected:** Amber result: "ALREADY USED". Low beep. Shows attendee details again for cross-check.

### TC-9.4 Invalid QR
**Steps:**
1. Show a random/non-existent QR
**Expected:** Red result: "INVALID". Low beep.

### TC-9.5 Manual Hash Entry
**Steps:**
1. Type a valid QR hash manually
2. Click "Check in"
**Expected:** Same result as camera scan.

### TC-9.6 Recent Scans List
**Steps:**
1. After multiple scans, check recent scans
**Expected:** Last 10 scans shown with hash, holder name, outcome icon, timestamp.

---

## SECTION 10 — Attendees Management

### TC-10.1 View Attendees Table
**Steps:**
1. As organizer, open event dashboard
2. Scroll to attendees section
**Expected:** Table with buyer name, phone, email, tier, pax, total, status, UTR, date.

### TC-10.2 Filter — Confirmed
**Steps:**
1. Click "Confirmed" filter tab
**Expected:** Only confirmed orders shown. Count badge shows correct number.

### TC-10.3 Filter — Checked In
**Steps:**
1. Click "Checked In" filter tab
**Expected:** Only checked-in attendees shown.

### TC-10.4 Filter — Pending
**Steps:**
1. Click "Pending" filter tab
**Expected:** Only pending verification orders shown.

### TC-10.5 Print Attendee List
**Steps:**
1. Click "Print" button
**Expected:** Browser print dialog opens with the filtered attendee list.

### TC-10.6 Empty Attendees
**Steps:**
1. Open an event with no bookings
**Expected:** "No bookings yet." message.

---

## SECTION 11 — Waitlist

### TC-11.1 Join Waitlist
**Steps:**
1. As user, open a sold-out event
2. Click "Join Waitlist"
**Expected:** Waitlist entry created. Position number shown. "Leave" button available.

### TC-11.2 Leave Waitlist
**Steps:**
1. Click "Leave" on waitlist entry
**Expected:** Entry removed.

### TC-11.3 Waitlist Auto-Offer (on rejection)
**Steps:**
1. User A joins waitlist for sold-out tier
2. Organizer rejects an existing order for that tier
**Expected:** User A promoted to OFFERED. Notification created. 24h expiry set.

### TC-11.4 Waitlist Panel (Organizer)
**Steps:**
1. As organizer, open event dashboard
2. Find waitlist section
3. Click "View details"
**Expected:** Popup/modal opens showing all waitlisted users with: position, name, tier, status (Waiting/Offered/Expired), join date.

### TC-11.5 Waitlist First-Come-First-Served
**Steps:**
1. Users A, B, C join waitlist in order
2. A ticket becomes available
**Expected:** User A (position 1) gets the offer first, not B or C.

### TC-11.6 Expired Offer Recycled
**Steps:**
1. User A has an OFFERED entry with expired 24h window
2. Organizer opens event dashboard (triggers expireWaitlistOffers)
**Expected:** User A moved back to WAITING. User B (next in line) gets OFFERED.

---

## SECTION 12 — Event Cancellation & Postponement

### TC-12.1 Cancel Event
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

### TC-12.2 Cancelled Ticket — User View
**Steps:**
1. As a user with a ticket for the cancelled event, go to `/tickets`
**Expected:**
- Ticket shows "Cancelled" badge
- QR has "Cancelled" overlay text
- "Contact organizer for refund details" link visible
- Cannot tap to expand

### TC-12.3 Postpone Event
**Steps:**
1. As organizer, open a PUBLISHED event
2. Click "Postpone event"
3. Enter new start date (future) and optional end date
4. Confirm
**Expected:**
- Event status → POSTPONED
- Ticket holders notified
- Postponement charge applied

### TC-12.4 Postponed Event on Homepage
**Steps:**
1. After postponing, visit homepage
**Expected:**
- Event appears in "Postponed Events" section (NOT in "All Events")
- Amber "Postponed" badge on card
- Event still clickable and bookable

### TC-12.5 Postponed Event — Past Date Rejected
**Steps:**
1. In postpone modal, try to select a past date for new start
**Expected:** Date picker prevents selection (min = now).

---

## SECTION 13 — Notifications

### TC-13.1 Notification Bell Visible
**Steps:**
1. Sign in as any user
**Expected:** Bell icon visible in navbar. Unread count badge if > 0.

### TC-13.2 View Notifications
**Steps:**
1. Click bell icon
**Expected:** Dropdown shows notifications with type label, event title, message, timestamp. Unread items highlighted.

### TC-13.3 Mark as Read
**Steps:**
1. Click checkmark on a notification
**Expected:** Notification marked as read. Badge count decreases.

### TC-13.4 Mark All Read
**Steps:**
1. Click "Mark all read"
**Expected:** All notifications marked read. Badge disappears.

### TC-13.5 Outside Click Closes Dropdown
**Steps:**
1. Open notification dropdown
2. Click outside
**Expected:** Dropdown closes.

### TC-13.6 Event Change Notification (Venue)
**Steps:**
1. As organizer, edit an event with confirmed bookings
2. Change the venue name
3. Save
**Expected:** All ticket holders receive VENUE_CHANGE notification.

### TC-13.7 Event Change Notification (City)
**Steps:**
1. Change the city in edit event form
2. Save
**Expected:** All ticket holders receive CITY_CHANGE notification.

### TC-13.8 Event Change Notification (Time)
**Steps:**
1. Change the start date/time in edit event form
2. Save
**Expected:** All ticket holders receive TIME_CHANGE notification.

---

## SECTION 14 — Event Editing

### TC-14.1 Edit Event Details
**Steps:**
1. As organizer, open event dashboard → "Edit" tab
2. Change title, description, venue, city, category, tags, social links, contact info
3. Save
**Expected:** All fields saved. Changes to venue/city/time trigger notifications.

### TC-14.2 Edit Ticket Tiers
**Steps:**
1. Change tier name and price
2. Try to reduce quantity below sold count
**Expected:** Error: "Quantity for [tier] cannot be less than [sold] (already sold)."

### TC-14.3 Remove Tier with Sales — Blocked
**Steps:**
1. Try to remove a tier that has sold tickets
**Expected:** Delete button not shown for tiers with sales.

### TC-14.4 Remove Tier without Sales — Allowed
**Steps:**
1. Remove a tier with 0 sales
**Expected:** Tier deleted.

### TC-14.5 Edit Phase Dates
**Steps:**
1. For a FLAT_PHASE tier, change phase opens/closes dates
2. Try to set opening date in the past
**Expected:** Date picker prevents past dates (min = now).

### TC-14.6 Phase Sequential Validation (Server)
**Steps:**
1. Set Phase 2 opens-at before Phase 1 closes-at
2. Save
**Expected:** Server error: "Phase [name] must open after the previous phase ends."

### TC-14.7 Completed Event — Read-Only
**Steps:**
1. Open a completed event dashboard
**Expected:**
- Edit form hidden
- Hero boost hidden
- Cancel/postpone hidden
- Door staff hidden
- Only gallery manager visible (with delete-on-hover)

### TC-14.8 Gallery Photo Deletion (Past Event)
**Steps:**
1. In past event gallery manager, hover over a photo
2. Click delete icon
**Expected:** Photo deleted from gallery. Other photos remain.

---

## SECTION 15 — Organizer Dashboard

### TC-15.1 Events List with Sorting
**Steps:**
1. Go to `/organizer` → "Events" tab
2. Try each sort option: Latest, Alphabetical, Popularity, Waitlist, Revenue
3. Toggle ascending/descending
**Expected:** Events re-sort correctly for each option.

### TC-15.2 Status Badges
**Steps:**
1. Check events with different statuses
**Expected:** Correct badges: Live (green), Draft (gray), Postponed (violet), Cancelled (red), Completed (gray).

### TC-15.3 Aggregated Analytics
**Steps:**
1. Go to "Analytics" tab
**Expected:**
- Aggregate stat cards: total events, orders, confirmed, tickets sold, revenue, payout, check-ins, no-shows, waitlist
- Bar charts for attendance and order status
- Revenue-by-event horizontal bars

### TC-15.4 Per-Event Analytics
**Steps:**
1. Scroll below aggregated section
**Expected:** Each event shows: total orders, confirmed, revenue, payout, tickets sold, capacity %, check-ins, waitlist count.

### TC-15.5 Print Report
**Steps:**
1. Click "Print report" for an event
2. On report page, click "Print"
**Expected:** Report page with revenue summary, confirmed orders, attendee check-ins. Browser print dialog works. Back button visible.

---

## SECTION 16 — Admin Panel

### TC-16.1 Admin Dashboard
**Steps:**
1. Sign in as admin
2. Visit `/admin`
**Expected:** Overview with total events, live events, total orders, pending orders, gross revenue, platform fee, net payouts, active boosts, pending hero boosts.

### TC-16.2 Admin — Event Management
**Steps:**
1. Visit `/admin/events`
**Expected:** All events listed. Can feature/unfeature, change status.

### TC-16.3 Admin — Order Management
**Steps:**
1. Visit `/admin/orders`
**Expected:** All orders across all events listed.

### TC-16.4 Admin — User Management
**Steps:**
1. Visit `/admin/users`
**Expected:** All users listed. Can toggle admin/organizer flags.

### TC-16.5 Admin — Hero Boost Approval
**Steps:**
1. Visit `/admin/boosts`
2. Approve a pending hero boost
**Expected:** Boost status updated. Event featured in homepage carousel.

### TC-16.6 Admin — Settings
**Steps:**
1. Visit `/admin/settings`
2. Change platform fee, cancellation charge, door staff pricing, hero boost pricing
3. Save
**Expected:** Settings saved. New bookings use updated fees.

### TC-16.7 Admin — Event Edit (Date Validation)
**Steps:**
1. Visit `/admin/events`
2. Edit an event
3. Try to set start date in the past
**Expected:** Date picker prevents past dates (min = now).

---

## SECTION 17 — User Menu & Navigation

### TC-17.1 User Menu Outside Click
**Steps:**
1. Click user avatar (top-right)
2. Click outside the dropdown
**Expected:** Dropdown closes.

### TC-17.2 User Menu Escape Key
**Steps:**
1. Open user menu
2. Press Escape
**Expected:** Dropdown closes.

### TC-17.3 Back Button — Print Report
**Steps:**
1. On `/organizer/events/[id]/report`, click "Back to event"
**Expected:** Returns to event management page.

### TC-17.4 Back Button — Print Ticket
**Steps:**
1. On `/tickets/[id]/print`, click "Back to tickets"
**Expected:** Returns to `/tickets`.

---

## SECTION 18 — Phased Pricing Display (User View)

### TC-18.1 Only Active Phase Shown
**Steps:**
1. As user, open a phased event detail page
**Expected:** Only the currently active phase shown with "Current pricing" badge and closing date. Full phase timeline hidden. Carry-forward info hidden.

### TC-18.2 No Active Phase
**Steps:**
1. Open a phased event where all phases are closed/sold-out
**Expected:** "All phases sold out" message. Waitlist option shown.

### TC-18.3 Named Tiers Optional
**Steps:**
1. As organizer, create a phased event without named tiers
**Expected:** Event created successfully. Phases work without named tiers.

---

## SECTION 19 — Image Handling

### TC-19.1 Profile Avatar Crop (1:1)
**Steps:**
1. Upload avatar in profile edit
2. Crop modal opens with square aspect
3. Zoom, pan, crop
**Expected:** Cropped square image saved.

### TC-19.2 Organizer Cover Crop (3:1)
**Steps:**
1. Upload cover in organizer profile edit
2. Crop modal opens with 3:1 aspect
**Expected:** Cropped wide image saved.

### TC-19.3 Event Gallery Upload
**Steps:**
1. In event creation/edit, upload multiple gallery photos
**Expected:** Photos uploaded. Gallery shows in 4-per-row grid on public page.

---

## SECTION 20 — Edge Cases

### TC-20.1 No Events in City
**Steps:**
1. Select a city with no events
**Expected:** "No events in [city] right now" message. Other cities suggested.

### TC-20.2 Organizer with No Events
**Steps:**
1. New organizer opens dashboard
**Expected:** "No events yet. Create your first event." with link.

### TC-20.3 Checkout — Missing Name
**Steps:**
1. Submit checkout form without name
**Expected:** Browser `required` blocks submission.

### TC-20.4 Checkout — Missing UTR (Paid)
**Steps:**
1. Submit paid checkout without UTR
**Expected:** Browser `required` blocks submission.

### TC-20.5 Mobile — No Horizontal Scroll
**Steps:**
1. Open app on mobile (or devtools mobile view)
2. Browse homepage, event detail, checkout, tickets, organizer dashboard
**Expected:** No horizontal scroll on any page.

---

## CRITICAL PATH — End-to-End Flow

This is the single most important test. Run it in order:

### Step 1: Organizer Creates Event
1. Sign in as organizer
2. Create a PAID event with 2 tiers (Early Bird ₹300 qty 5, General ₹500 qty 10)
3. Publish the event

### Step 2: User Discovers Event
4. Sign in as user (different account)
5. Find the event on homepage
6. Open event detail page
7. Verify tiers and pricing shown correctly

### Step 3: User Books Ticket
8. Click "Book now" on Early Bird tier
9. Enter name, phone, UTR, payment screenshot
10. Submit → order PENDING_VERIFICATION

### Step 4: Organizer Verifies Payment
11. Sign in as organizer
12. Go to "Verify" tab
13. Approve the order

### Step 5: Verify Ticket Generated
14. Sign in as user
15. Go to `/tickets`
16. Verify: ticket appears in "Passes" with QR code
17. Verify: status is "Valid"

### Step 6: Verify Inventory Decremented
18. As organizer, check event analytics
19. Verify: tickets sold = 1, remaining = 4 for Early Bird

### Step 7: Door Scanner Check-In
20. As organizer, open event scan page
21. Scan the user's QR code
22. Verify: "VALID — Checked In", shows name, email, phone, pax, event name

### Step 8: Verify Checked-In State
23. As user, go to `/tickets`
24. Verify: ticket now shows "Scanned" badge

### Step 9: Verify Attendee Table
25. As organizer, open event dashboard
26. Check attendees table → "Checked In" filter
27. Verify: the user appears with check-in time

### Step 10: Print Report
28. Click "Print report"
29. Verify: report shows confirmed orders, check-ins, revenue summary

**If all 10 steps pass, the critical path is working.**

---

## Test Results Template

| TC # | Scenario | Status | Notes |
|------|----------|--------|-------|
| 1.1 | Sign up | | |
| 1.2 | Sign in | | |
| ... | ... | | |

**Status values:** PASS / FAIL / BLOCKED / SKIP
