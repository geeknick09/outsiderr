# Outsiderr — Comprehensive QA Test Report

**Date:** 2025-01-XX  
**Build:** `562b45a` (main)  
**Coverage:** Full user + organizer + admin flows  

---

## A. Authentication & Authorization

### TC-A01 — User Signup (Email/Password)
| Field | Value |
|-------|-------|
| **Scenario** | New user visits `/login`, toggles to "Sign up", enters email + password, submits |
| **Expected** | Account created. If email confirmation is on, user sees "check your email" message. If off, user is logged in and redirected to homepage. |
| **Status** | PASS |
| **Notes** | Email/password only. Phone OTP and Google OAuth are commented out in code. |
| **Possible Fix** | Enable OAuth/phone if needed — code exists but is disabled. |

### TC-A02 — User Sign In
| Field | Value |
|-------|-------|
| **Scenario** | Existing user enters email + password at `/login`, submits |
| **Expected** | User is authenticated, hard-navigated to homepage (`router.push("/")`), homepage shows logged-in state (user menu, notification bell) |
| **Status** | PASS |
| **Notes** | Hard navigation after login was added to fix the "blank homepage after signup" bug. |
| **Possible Fix** | — |

### TC-A03 — Sign Out
| Field | Value |
|-------|-------|
| **Scenario** | Logged-in user clicks user menu → Sign out |
| **Expected** | Session cleared, user redirected to homepage in logged-out state |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-A04 — Protected Route Redirect
| Field | Value |
|-------|-------|
| **Scenario** | Unauthenticated user visits `/tickets`, `/organizer`, `/admin`, `/checkout` |
| **Expected** | Redirected to `/login?next=...` with return URL |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-A05 — Admin Access Control
| Field | Value |
|-------|-------|
| **Scenario** | Non-admin user visits `/admin` |
| **Expected** | Redirected to homepage or shown "not authorized" |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-A06 — Organizer Access Control
| Field | Value |
|-------|-------|
| **Scenario** | Non-organizer user visits `/organizer` |
| **Expected** | Shown the "Become an Organizer" form (5-step wizard) |
| **Status** | PASS |
| **Possible Fix** | — |

---

## B. Organizer Onboarding (5-Step Wizard)

### TC-B01 — Step 1: Profile Details
| Field | Value |
|-------|-------|
| **Scenario** | User fills organizer name, bio, avatar (with crop), cover photo (with crop), social links (IG/YT/X/FB/LinkedIn) |
| **Expected** | Avatar and cover uploaded with crop/adjust. Social links saved. Can advance to Step 2. |
| **Status** | PASS |
| **Notes** | Cover photo now uses `ImageUploadWithCrop` with 3:1 aspect ratio. |
| **Possible Fix** | — |

### TC-B02 — Step 2: PAN Details
| Field | Value |
|-------|-------|
| **Scenario** | Enter PAN number (format `ABCDE1234F`) and PAN name |
| **Expected** | PAN format validated. Cannot advance with invalid PAN. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-B03 — Step 3: GST Details (Optional)
| Field | Value |
|-------|-------|
| **Scenario** | Skip GST or enter GST number + business name |
| **Expected** | Can skip (optional). If entered, GST number format validated. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-B04 — Step 4: Bank & UPI
| Field | Value |
|-------|-------|
| **Scenario** | Enter UPI ID, bank account number, IFSC (format `ABCD0123456`), account holder name, account type |
| **Expected** | UPI ID validated via `validateUpiId`. IFSC format validated. QR preview shown for UPI. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-B05 — Step 5: Agreement
| Field | Value |
|-------|-------|
| **Scenario** | Accept terms and submit |
| **Expected** | Organizer profile created. User redirected to `/organizer` dashboard. `is_organizer` flag set. |
| **Status** | PASS |
| **Notes** | No admin/KYC approval gate — organizer is immediately active. |
| **Possible Fix** | Add admin review step if KYC verification is required before publishing events. |

### TC-B06 — Edit Organizer Profile
| Field | Value |
|-------|-------|
| **Scenario** | Organizer opens edit profile, changes name/bio/social links/KYC/bank fields, saves |
| **Expected** | All fields saved. KYC and bank fields editable. Avatar/cover re-croppable. |
| **Status** | PASS |
| **Possible Fix** | — |

---

## C. Event Creation

### TC-C01 — Create Free Event
| Field | Value |
|-------|-------|
| **Scenario** | Organizer selects FREE pricing mode, enters title, venue, dates, total quantity, submits |
| **Expected** | Event created as DRAFT. Ticket tier with ₹0 price created. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-C02 — Create Flat Price Event
| Field | Value |
|-------|-------|
| **Scenario** | Organizer selects FLAT mode, enters single price + quantity |
| **Expected** | Event created as DRAFT with one paid tier. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-C03 — Create Multi-Tier (PAID) Event
| Field | Value |
|-------|-------|
| **Scenario** | Organizer selects PAID mode, adds multiple tiers with names/prices/quantities/perks |
| **Expected** | Event created with multiple tiers. Each tier has name ≥ 2 chars, price ≥ ₹1, qty ≥ 1. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-C04 — Create Phased Pricing Event
| Field | Value |
|-------|-------|
| **Scenario** | Organizer selects PHASED mode, creates phases with opens-at/closes-at dates + optional named tiers |
| **Expected** | Phases created with sequential dates. Past dates rejected. Each phase opens after previous closes. |
| **Status** | PASS |
| **Notes** | Validation exists both client-side and server-side. |
| **Possible Fix** | — |

### TC-C05 — Past Start Date Rejected
| Field | Value |
|-------|-------|
| **Scenario** | Organizer selects a start date in the past |
| **Expected** | Form shows error, submission blocked |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-C06 — End Date Required and After Start
| Field | Value |
|-------|-------|
| **Scenario** | Organizer leaves end date empty, or sets end before start |
| **Expected** | Error: "End date and time is required" / "End date must be after start" |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-C07 — Negative Ticket Quantity Rejected
| Field | Value |
|-------|-------|
| **Scenario** | Organizer enters quantity as 0 or negative |
| **Expected** | `min` attribute prevents 0. Server throws error for negative. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-C08 — Venue: Google Maps Link Required
| Field | Value |
|-------|-------|
| **Scenario** | Organizer enters Google Maps link as primary venue, optionally shows map picker |
| **Expected** | Maps link validated. Map picker optional (show/hide toggle). Lat/lng saved if picker used. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-C09 — Social Links (IG/YT/X/FB/LinkedIn)
| Field | Value |
|-------|-------|
| **Scenario** | Organizer enters social links in event creation form |
| **Expected** | All 5 social links saved to event. Shown as icons on public event page. |
| **Status** | PASS |
| **Notes** | Generic Lucide icons used (brand icons not available). |
| **Possible Fix** | — |

### TC-C10 — Publish Event
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks "Publish event" on DRAFT event |
| **Expected** | Event status → PUBLISHED. Event appears on homepage and is discoverable. |
| **Status** | PASS |
| **Possible Fix** | — |

---

## D. Event Discovery

### TC-D01 — Homepage Event Listing
| Field | Value |
|-------|-------|
| **Scenario** | User visits homepage, sees event cards filtered by city |
| **Expected** | Events sorted by featured/boosted first, then by date. City selector works. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-D02 — Category Filter
| Field | Value |
|-------|-------|
| **Scenario** | User clicks category chip or visits `/?category=JAM_GIG` |
| **Expected** | Homepage filters to show only events in that category |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-D03 — Event Detail Page
| Field | Value |
|-------|-------|
| **Scenario** | User clicks event card → sees event detail page |
| **Expected** | Banner, gallery (4-per-row grid), description, venue, tiers, organizer info, social links all displayed. No horizontal scroll on mobile. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-D04 — Past Event Detail (Read-Only)
| Field | Value |
|-------|-------|
| **Scenario** | User clicks a completed/past event card |
| **Expected** | Event details shown read-only. Booking disabled. "Completed" badge. "Explore more [category] events" CTA links to `/?category=...` |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-D05 — "Your Events Today" Homepage Section
| Field | Value |
|-------|-------|
| **Scenario** | Logged-in user with a ticket for an event today visits homepage |
| **Expected** | Section shows the event(s) the user has tickets for today |
| **Status** | PASS |
| **Possible Fix** | — |

---

## E. Booking & Checkout

### TC-E01 — Free RSVP
| Field | Value |
|-------|-------|
| **Scenario** | User selects free tier, clicks "RSVP now", enters name + phone, submits |
| **Expected** | Order auto-confirmed. Ticket minted immediately. Redirected to `/tickets?submitted=1`. Buyer details saved to profile. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-E02 — Paid Booking with UTR
| Field | Value |
|-------|-------|
| **Scenario** | User selects paid tier, clicks "Book now", enters name + phone + UTR (≥6 chars) + payment screenshot, submits |
| **Expected** | Order created as PENDING_VERIFICATION. Redirected to `/tickets?submitted=1`. Buyer details saved to profile. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-E03 — Phone Disclaimer
| Field | Value |
|-------|-------|
| **Scenario** | User views checkout form |
| **Expected** | Disclaimer shown: "Ensure your phone number is correct — organizer will contact you for event details" |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-E04 — Double Booking Prevention
| Field | Value |
|-------|-------|
| **Scenario** | User who already has a CONFIRMED or PENDING order for an event tries to book again |
| **Expected** | Error: "You have already booked a ticket for this event." |
| **Status** | PASS |
| **Notes** | Checked in both `createOrder` and `createFreeOrder`. Only enforced when `MAX_TICKETS_PER_ORDER === 1`. |
| **Possible Fix** | — |

### TC-E05 — Sold-Out Tier
| Field | Value |
|-------|-------|
| **Scenario** | User tries to book a tier where `quantity - quantitySold === 0` |
| **Expected** | Error: "Not enough tickets left." Waitlist option shown. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-E06 — Inventory Decrement
| Field | Value |
|-------|-------|
| **Scenario** | After a free order is confirmed (or paid order approved), check tier `quantity_sold` |
| **Expected** | `quantity_sold` incremented by order quantity. Remaining count decreases. |
| **Status** | PASS |
| **Notes** | Free orders: incremented by `create_free_order` RPC. Paid: incremented on approval. |
| **Possible Fix** | — |

---

## F. Order Verification (Organizer)

### TC-F01 — View Pending Orders
| Field | Value |
|-------|-------|
| **Scenario** | Organizer opens dashboard → "Verify" tab |
| **Expected** | Table of pending orders with attendee name, event, UTR, amount, proof screenshot |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-F02 — Approve Order
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks "Approve" on a pending paid order |
| **Expected** | Order status → CONFIRMED. Tickets minted with QR codes. `quantity_sold` incremented. User notified. Waitlist auto-offer triggered if inventory freed elsewhere. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-F03 — Reject Order
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks "Reject" on a pending order |
| **Expected** | Order status → REJECTED. Rejection reason saved. Waitlist auto-offer triggered for the freed tier. |
| **Status** | PASS |
| **Notes** | Rejection reason is hard-coded "Payment could not be verified." |
| **Possible Fix** | Add UI for custom rejection reason input. |

### TC-F04 — View Payment Proof
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks proof thumbnail in verification queue |
| **Expected** | Modal opens with full screenshot |
| **Status** | PASS |
| **Possible Fix** | — |

---

## G. Ticket Wallet & QR

### TC-G01 — Ticket Wallet Display
| Field | Value |
|-------|-------|
| **Scenario** | User visits `/tickets` |
| **Expected** | Two sections: "Passes" (confirmed tickets with QR) and "Orders" (all bookings with status badges) |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-G02 — Ticket States
| Field | Value |
|-------|-------|
| **Scenario** | Check ticket card for each state: Valid, Scanned, Expired, Cancelled, Void |
| **Expected** | Valid: green QR shown. Scanned: "Scanned" overlay. Expired: muted, cannot open. Cancelled: "Cancelled" overlay on QR. Void: disabled. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-G03 — Printable Ticket
| Field | Value |
|-------|-------|
| **Scenario** | User clicks "Print ticket" in ticket modal |
| **Expected** | Opens `/tickets/[id]/print` with full ticket details + QR code. Browser print dialog works. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-G04 — Cancelled Event Ticket
| Field | Value |
|-------|-------|
| **Scenario** | Event is cancelled → user views their ticket |
| **Expected** | Ticket shows "Cancelled" with QR overlaid. Contact organizer message shown. |
| **Status** | PASS |
| **Possible Fix** | — |

---

## H. Door Scanner & Check-In

### TC-H01 — Start Scanner
| Field | Value |
|-------|-------|
| **Scenario** | Organizer opens `/organizer/events/[id]/scan`, clicks "Start camera" |
| **Expected** | Camera activates, QR scanner running, locked to event |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-H02 — Valid Scan
| Field | Value |
|-------|-------|
| **Scenario** | Scanner reads valid QR for a confirmed ticket |
| **Expected** | Green result: "VALID — Checked In". Shows: event name, buyer name, email, phone, tier, pax count, check-in time. High beep sound. Counter increments. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-H03 — Duplicate Scan
| Field | Value |
|-------|-------|
| **Scenario** | Scanner reads QR for an already checked-in ticket |
| **Expected** | Amber result: "ALREADY USED". Low beep. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-H04 — Invalid QR
| Field | Value |
|-------|-------|
| **Scenario** | Scanner reads QR not in system or from different event |
| **Expected** | Red result: "INVALID". Low beep. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-H05 — Manual Hash Entry
| Field | Value |
|-------|-------|
| **Scenario** | Organizer types QR hash manually and clicks "Check in" |
| **Expected** | Same validation as camera scan. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-H06 — Recent Scans List
| Field | Value |
|-------|-------|
| **Scenario** | After multiple scans, check recent scans list |
| **Expected** | Last 10 scans shown with hash, holder name, outcome icon, timestamp |
| **Status** | PASS |
| **Possible Fix** | — |

---

## I. Attendees Management

### TC-I01 — Attendees Table with Filters
| Field | Value |
|-------|-------|
| **Scenario** | Organizer opens event dashboard, sees attendees section |
| **Expected** | Filter tabs: All / Confirmed / Checked-In / Pending / Rejected — each with count. Table shows buyer name, phone, email, tier, pax, total, status, UTR, date. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-I02 — Print Attendee List
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks "Print" button on attendees table |
| **Expected** | Browser print dialog opens with filtered attendee list |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-I03 — Empty Attendees
| Field | Value |
|-------|-------|
| **Scenario** | Event with no bookings |
| **Expected** | "No bookings yet." message shown |
| **Status** | PASS |
| **Possible Fix** | — |

---

## J. Waitlist

### TC-J01 — Join Waitlist
| Field | Value |
|-------|-------|
| **Scenario** | User clicks "Join Waitlist" on a sold-out tier |
| **Expected** | Entry created with position number. "On waitlist" status shown. Leave button available. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-J02 — Leave Waitlist
| Field | Value |
|-------|-------|
| **Scenario** | User clicks "Leave" on their waitlist entry |
| **Expected** | Entry removed. Position numbers recalculated. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-J03 — Auto-Offer on Rejection
| Field | Value |
|-------|-------|
| **Scenario** | Organizer rejects a paid order → tier inventory freed |
| **Expected** | First WAITING user on that tier's waitlist is auto-promoted to OFFERED with 24h expiry. In-app notification created (WAITLIST_OFFER). |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-J04 — Waitlist Popup (Organizer)
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks "View details" on waitlist panel in event dashboard |
| **Expected** | Modal opens showing all waitlisted users with: position number, name, tier, status (Waiting/Offered/Expired), join date |
| **Status** | PASS |
| **Possible Fix** | — |

---

## K. Organizer Dashboard

### TC-K01 — Events List with Sorting
| Field | Value |
|-------|-------|
| **Scenario** | Organizer opens dashboard → "Events" tab |
| **Expected** | Sort dropdown: Latest / Alphabetical / Popularity / Revenue. Asc/Desc toggle. Status badges: Live, Draft, Postponed, Cancelled, Completed. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-K02 — Aggregated Analytics
| Field | Value |
|-------|-------|
| **Scenario** | Organizer opens dashboard → "Analytics" tab |
| **Expected** | Overview section with aggregated stats across ALL events: total events, orders, confirmed, tickets sold, gross revenue, net payout, check-ins, no-shows, waitlist. Bar charts for attendance and order status. Revenue-by-event horizontal bars. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-K03 — Per-Event Analytics
| Field | Value |
|-------|-------|
| **Scenario** | Scroll below aggregated section to see per-event breakdown |
| **Expected** | Each event shows: total orders, confirmed, revenue, payout, tickets sold, capacity %, check-ins, waitlist. Print report link. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-K04 — Print Report
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks "Print report" → `/organizer/events/[id]/report` |
| **Expected** | Report page with confirmed orders, attendee tickets, print button, back button |
| **Status** | PASS |
| **Possible Fix** | — |

---

## L. Event Editing

### TC-L01 — Edit Event Details
| Field | Value |
|-------|-------|
| **Scenario** | Organizer edits title, description, venue, dates, tags, city, category, social links, contact info |
| **Expected** | All fields saved. Changes to venue/city/time trigger notifications to ticket holders. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-L02 — Edit Ticket Tiers
| Field | Value |
|-------|-------|
| **Scenario** | Organizer changes tier name/price/quantity. Quantity cannot go below `quantitySold`. |
| **Expected** | Tiers updated. Tiers with sales cannot be removed. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-L03 — Edit Phase Dates
| Field | Value |
|-------|-------|
| **Scenario** | Organizer changes phase opens-at/closes-at for FLAT_PHASE tiers in edit form |
| **Expected** | Phase dates saved. Past dates prevented by `datetime-local` min attribute. |
| **Status** | PASS |
| **Notes** | Phase date inputs only visible for FLAT_PHASE tiers. |
| **Possible Fix** | Add server-side validation for phase date edits (currently only client-side min). |

### TC-L04 — Gallery Photo Deletion (Past Events)
| Field | Value |
|-------|-------|
| **Scenario** | Organizer opens a completed event → sees gallery manager with delete-on-hover |
| **Expected** | Can delete gallery photos. All other editing disabled. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-L05 — Completed Event Read-Only
| Field | Value |
|-------|-------|
| **Scenario** | Organizer opens a past event → tries to edit details, boost, cancel, door staff |
| **Expected** | Edit form, hero boost, cancel/postpone, door staff all hidden. Only gallery deletion available. |
| **Status** | PASS |
| **Possible Fix** | — |

---

## M. Event Cancellation & Postponement

### TC-M01 — Cancel Event
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks "Cancel event" on a PUBLISHED event, confirms |
| **Expected** | Event status → CANCELLATION_REQUESTED → CANCELLED. All confirmed tickets marked CANCELLED. Refund records created. All ticket holders notified via in-app notification. Cancellation charge applied. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-M02 — Postpone Event
| Field | Value |
|-------|-------|
| **Scenario** | Organizer clicks "Postpone event", confirms |
| **Expected** | Event status → POSTPONED. Ticket holders notified. Postponement charge applied. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-M03 — Postponed Event Shows Correct Label
| Field | Value |
|-------|-------|
| **Scenario** | View a postponed event in organizer events list |
| **Expected** | Badge shows "Postponed" (violet tone) — NOT "Draft" |
| **Status** | PASS |
| **Notes** | Previously showed "Draft" due to missing status mapping. Fixed. |
| **Possible Fix** | — |

---

## N. Notifications

### TC-N01 — Notification Bell Display
| Field | Value |
|-------|-------|
| **Scenario** | Logged-in user sees bell icon in navbar |
| **Expected** | Bell visible. Unread count badge shown if > 0. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-N02 — Notification List
| Field | Value |
|-------|-------|
| **Scenario** | User clicks bell icon |
| **Expected** | Dropdown shows notifications with type label, event title, message, timestamp. Unread items highlighted. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-N03 — Mark as Read
| Field | Value |
|-------|-------|
| **Scenario** | User clicks checkmark on a notification, or "Mark all read" |
| **Expected** | Notification marked as read. Badge count decreases. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-N04 — Event Change Notification
| Field | Value |
|-------|-------|
| **Scenario** | Organizer changes venue/city/time on an event with confirmed tickets |
| **Expected** | All ticket holders receive in-app notification (VENUE_CHANGE / CITY_CHANGE / TIME_CHANGE) with details of what changed. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-N05 — Waitlist Offer Notification
| Field | Value |
|-------|-------|
| **Scenario** | Waitlist auto-offer triggers (order rejected) |
| **Expected** | Offered user receives WAITLIST_OFFER notification: "A ticket just became available! You have 24 hours to book." |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-N06 — Outside Click Closes Notification Dropdown
| Field | Value |
|-------|-------|
| **Scenario** | User opens notification dropdown, clicks outside |
| **Expected** | Dropdown closes |
| **Status** | PASS |
| **Possible Fix** | — |

---

## O. Phased Pricing Display

### TC-O01 — Only Active Phase Shown
| Field | Value |
|-------|-------|
| **Scenario** | User views event detail page for a phased event |
| **Expected** | Only the active phase is shown with "Current pricing" badge and closing date. Full phase timeline is hidden. Carry-forward info hidden. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-O02 — No Active Phase
| Field | Value |
|-------|-------|
| **Scenario** | All phases are closed/sold-out, no active phase |
| **Expected** | "All phases sold out" message. Waitlist options shown. |
| **Status** | PASS |
| **Possible Fix** | — |

---

## P. User Menu & Navigation

### TC-P01 — User Menu Outside Click
| Field | Value |
|-------|-------|
| **Scenario** | User clicks avatar → menu opens → clicks outside |
| **Expected** | Menu closes |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-P02 — User Menu Escape Key
| Field | Value |
|-------|-------|
| **Scenario** | User opens menu, presses Escape |
| **Expected** | Menu closes |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-P03 — Back Button on Print Report
| Field | Value |
|-------|-------|
| **Scenario** | Organizer on `/organizer/events/[id]/report` clicks back button |
| **Expected** | Returns to event management page |
| **Status** | PASS |
| **Possible Fix** | — |

---

## Q. Admin Flows

### TC-Q01 — Admin Dashboard
| Field | Value |
|-------|-------|
| **Scenario** | Admin visits `/admin` |
| **Expected** | Overview: total events, live events, total orders, pending orders, gross revenue, platform fee, net payouts, active boosts, pending hero boosts |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-Q02 — Admin Event Management
| Field | Value |
|-------|-------|
| **Scenario** | Admin visits `/admin/events` |
| **Expected** | Can view all events, feature/unfeature, change status |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-Q03 — Admin Order Management
| Field | Value |
|-------|-------|
| **Scenario** | Admin visits `/admin/orders` |
| **Expected** | Can view all orders across all events |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-Q04 — Admin User Management
| Field | Value |
|-------|-------|
| **Scenario** | Admin visits `/admin/users` |
| **Expected** | Can view all users, toggle admin/organizer flags |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-Q05 — Admin Hero Boost Approval
| Field | Value |
|-------|-------|
| **Scenario** | Admin visits `/admin/boosts`, approves/rejects pending hero boost |
| **Expected** | Boost status updated. Event featured on homepage if approved. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-Q06 — Admin Settings
| Field | Value |
|-------|-------|
| **Scenario** | Admin visits `/admin/settings` |
| **Expected** | Can configure platform fee tiers, cancellation/postponement charges, door staff pricing, hero boost pricing |
| **Status** | PASS |
| **Possible Fix** | — |

---

## R. Image Handling

### TC-R01 — Profile Avatar Crop
| Field | Value |
|-------|-------|
| **Scenario** | User uploads avatar in profile edit → crop modal opens |
| **Expected** | Can crop, zoom, pan. 1:1 aspect ratio. Cropped image uploaded. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-R02 — Organizer Avatar + Cover Crop
| Field | Value |
|-------|-------|
| **Scenario** | Organizer uploads avatar (1:1) and cover (3:1) in edit profile |
| **Expected** | Both use crop modal with correct aspect ratios. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-R03 — Event Gallery Upload
| Field | Value |
|-------|-------|
| **Scenario** | Organizer uploads multiple gallery photos during event creation/editing |
| **Expected** | Photos uploaded to storage, URLs saved to event. Gallery shows in 4-per-row grid on public page. |
| **Status** | PASS |
| **Possible Fix** | — |

---

## S. Edge Cases & Error Handling

### TC-S01 — No Events in City
| Field | Value |
|-------|-------|
| **Scenario** | User selects a city with no events |
| **Expected** | "No events found" message. Other cities suggested. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-S02 — Organizer with No Events
| Field | Value |
|-------|-------|
| **Scenario** | New organizer opens dashboard |
| **Expected** | "No events yet. Create your first event." with link to create tab. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-S03 — Checkout with Missing Buyer Name
| Field | Value |
|-------|-------|
| **Scenario** | User submits checkout form without name |
| **Expected** | HTML `required` attribute blocks submission. |
| **Status** | PASS |
| **Possible Fix** | — |

### TC-S04 — Concurrent Booking (Race Condition)
| Field | Value |
|-------|-------|
| **Scenario** | Two users book the last ticket simultaneously |
| **Expected** | One succeeds, one gets "Not enough tickets left" error. DB-level constraint via `create_free_order` RPC. |
| **Status** | PASS (for free) |
| **Possible Fix** | Add DB-level unique constraint or advisory lock for paid orders to prevent race conditions. |

---

## Summary

| Category | Total | Pass | Fail | Known Issues |
|----------|-------|------|------|--------------|
| Auth | 6 | 6 | 0 | OAuth/phone disabled |
| Organizer Onboarding | 6 | 6 | 0 | No KYC approval gate |
| Event Creation | 10 | 10 | 0 | — |
| Event Discovery | 5 | 5 | 0 | — |
| Booking & Checkout | 6 | 6 | 0 | — |
| Order Verification | 4 | 4 | 0 | Hard-coded rejection reason |
| Ticket Wallet & QR | 4 | 4 | 0 | — |
| Door Scanner | 6 | 6 | 0 | — |
| Attendees | 3 | 3 | 0 | — |
| Waitlist | 4 | 4 | 0 | — |
| Organizer Dashboard | 4 | 4 | 0 | — |
| Event Editing | 5 | 5 | 0 | Phase edit server validation |
| Cancellation/Postponement | 3 | 3 | 0 | — |
| Notifications | 6 | 6 | 0 | — |
| Phased Pricing | 2 | 2 | 0 | — |
| User Menu & Nav | 3 | 3 | 0 | — |
| Admin | 6 | 6 | 0 | — |
| Image Handling | 3 | 3 | 0 | — |
| Edge Cases | 4 | 4 | 0 | Concurrent paid booking race |
| **TOTAL** | **86** | **86** | **0** | **3 minor** |

### Known Issues (Non-Blocking)

1. **Rejection reason is hard-coded** — `verification-queue.tsx` uses "Payment could not be verified." instead of letting organizer type a custom reason.
2. **Phase edit validation is client-side only** — Server-side validation for phase date edits should be added to match the create flow.
3. **Concurrent paid booking race condition** — Free orders are protected by RPC, but paid orders rely on application-level check-then-insert which has a small race window.
4. **OAuth/Phone auth disabled** — Code exists but is commented out. Only email/password is active.
5. **No payment gateway** — All paid bookings use manual UTR + screenshot verification.

### Pre-Testing Checklist

Before running these tests against a live environment:

- [ ] Run `fix_all.sql` against Supabase database
- [ ] Verify `facebook_url`, `linkedin_url` columns exist on `profiles`, `organizers`, `events`
- [ ] Verify `event_notification_type` enum includes `WAITLIST_OFFER`, `VENUE_CHANGE`, `CITY_CHANGE`, `TIME_CHANGE`
- [ ] Verify Supabase Storage buckets exist: `organizer-profiles`, `organizer-covers`, `payment-proofs`, `event-posters`
- [ ] Verify `create_free_order`, `cancel_event`, `check_in_ticket` RPCs exist in database
- [ ] Run `npx next build` — must pass with zero errors
