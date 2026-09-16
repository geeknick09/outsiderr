/**
 * Deterministic test fixtures for Outsiderr.
 *
 * These are in-memory representations of the canonical test dataset.
 * Used by:
 * - Vitest unit/integration tests (import directly)
 * - scripts/seed-test-data.mjs (inserts into a test database)
 *
 * All IDs are deterministic UUIDs so tests can reference them without
 * querying the database first.
 *
 * The dataset represents a realistic scenario:
 * - 1 organizer (verified)
 * - 1 admin user
 * - 1 regular user (ticket buyer)
 * - 3 events (free, paid, sold-out)
 * - 4 ticket tiers across events
 * - 2 confirmed orders (online + box-office)
 * - 2 tickets (1 VALID, 1 USED)
 * - 1 scanner PIN + 1 box-office PIN
 */

// ============================================================
// Deterministic UUIDs (all fixed for reproducibility)
// ============================================================
export const IDS = {
  // Users
  ADMIN_USER_ID: "a0000000-0000-4000-8000-000000000001",
  ORGANIZER_OWNER_ID: "a0000000-0000-4000-8000-000000000002",
  REGULAR_USER_ID: "a0000000-0000-4000-8000-000000000003",
  ORGANIZER_ID: "b0000000-0000-4000-8000-000000000001",

  // Events
  FREE_EVENT_ID: "c0000000-0000-4000-8000-000000000001",
  PAID_EVENT_ID: "c0000000-0000-4000-8000-000000000002",
  SOLD_OUT_EVENT_ID: "c0000000-0000-4000-8000-000000000003",

  // Tiers
  FREE_TIER_ID: "d0000000-0000-4000-8000-000000000001",
  PAID_GENERAL_TIER_ID: "d0000000-0000-4000-8000-000000000002",
  PAID_VIP_TIER_ID: "d0000000-0000-4000-8000-000000000003",
  SOLD_OUT_TIER_ID: "d0000000-0000-4000-8000-000000000004",

  // Orders
  ONLINE_ORDER_ID: "e0000000-0000-4000-8000-000000000001",
  BOX_OFFICE_ORDER_ID: "e0000000-0000-4000-8000-000000000002",

  // Tickets
  VALID_TICKET_ID: "f0000000-0000-4000-8000-000000000001",
  USED_TICKET_ID: "f0000000-0000-4000-8000-000000000002",

  // PINs
  SCANNER_PIN_ID: "10000000-0000-4000-8000-000000000001",
  BOX_OFFICE_PIN_ID: "10000000-0000-4000-8000-000000000002",
} as const;

// ============================================================
// Fixtures
// ============================================================

export const adminUser = {
  id: IDS.ADMIN_USER_ID,
  email: "admin@outsiderr.test",
  fullName: "Test Admin",
  phone: "9000000001",
  isAdmin: true,
  isOrganizer: false,
};

export const organizerOwner = {
  id: IDS.ORGANIZER_OWNER_ID,
  email: "organizer@outsiderr.test",
  fullName: "Test Organizer",
  phone: "9000000002",
  isAdmin: false,
  isOrganizer: true,
};

export const regularUser = {
  id: IDS.REGULAR_USER_ID,
  email: "user@outsiderr.test",
  fullName: "Test User",
  phone: "9000000003",
  isAdmin: false,
  isOrganizer: false,
};

export const organizer = {
  id: IDS.ORGANIZER_ID,
  ownerId: IDS.ORGANIZER_OWNER_ID,
  name: "Outsiderr Test Crew",
  bio: "Test organizer for automated testing",
  description: "A test crew for hip-hop events in Mumbai.",
  avatarUrl: null,
  coverUrl: null,
  instagramUrl: null,
  youtubeUrl: null,
  xUrl: null,
  facebookUrl: null,
  linkedinUrl: null,
  upiId: "testorg@upi",
  upiQrUrl: null,
  verified: true,
  panNumber: null,
  panName: null,
  gstNumber: null,
  gstBusinessName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  bankAccountName: null,
  bankAccountType: null,
};

// Events are 30/45/20 days in the future
const futureDate = (days: number, hour = 19): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const freeEvent = {
  id: IDS.FREE_EVENT_ID,
  organizerId: IDS.ORGANIZER_ID,
  title: "Free Cypher Session - Mumbai",
  description: "Open cypher for all hip-hop heads. Free entry.",
  category: "CYPHER_BATTLE" as const,
  categories: ["CYPHER_BATTLE"] as const,
  city: "MUMBAI" as const,
  venueName: "Marine Drive",
  venueAddress: "Marine Drive, Mumbai",
  startsAt: futureDate(30),
  endsAt: futureDate(30, 23),
  pricingMode: "FREE" as const,
  feePayer: "ORGANIZER" as const,
  status: "PUBLISHED" as const,
  terms: ["No refunds", "Bring water"],
  thingsToKnow: ["Open floor", "All skill levels welcome"],
  tags: ["hip-hop", "cypher"],
  registrationsCount: 0,
  isFeatured: false,
  cardPosterUrl: null,
  bannerPosterUrl: null,
  latitude: null,
  longitude: null,
  googleMapsLink: null,
  commissionBps: 1000,
  commissionEnabled: true,
  convenienceFeeBps: 200,
  convenienceFeeEnabled: true,
  needsDoorStaff: false,
  waitlistEnabled: true,
  allowBookingDuringEvent: false,
  contactEmail: "organizer@outsiderr.test",
  contactPhone: "9000000002",
  instagramUrl: null,
  youtubeUrl: null,
  xUrl: null,
  facebookUrl: null,
  linkedinUrl: null,
  photoUrls: [],
};

export const paidEvent = {
  id: IDS.PAID_EVENT_ID,
  organizerId: IDS.ORGANIZER_ID,
  title: "Underground Dance Battle - Delhi",
  description: "1v1 dance battle. ₹500 entry. Prize pool ₹10,000.",
  category: "CYPHER_BATTLE" as const,
  categories: ["CYPHER_BATTLE"] as const,
  city: "DELHI" as const,
  venueName: "Connaught Place",
  venueAddress: "Connaught Place, Delhi",
  startsAt: futureDate(45),
  endsAt: futureDate(45, 23),
  pricingMode: "PAID" as const,
  feePayer: "BUYER" as const,
  status: "PUBLISHED" as const,
  terms: ["No refunds", "ID required"],
  thingsToKnow: ["Registration starts 1hr before", "Bring your own music"],
  tags: ["hip-hop", "dance", "battle"],
  registrationsCount: 0,
  isFeatured: true,
  cardPosterUrl: null,
  bannerPosterUrl: null,
  latitude: null,
  longitude: null,
  googleMapsLink: null,
  commissionBps: 1000,
  commissionEnabled: true,
  convenienceFeeBps: 200,
  convenienceFeeEnabled: true,
  needsDoorStaff: true,
  waitlistEnabled: true,
  allowBookingDuringEvent: false,
  contactEmail: "organizer@outsiderr.test",
  contactPhone: "9000000002",
  instagramUrl: null,
  youtubeUrl: null,
  xUrl: null,
  facebookUrl: null,
  linkedinUrl: null,
  photoUrls: [],
};

export const soldOutEvent = {
  id: IDS.SOLD_OUT_EVENT_ID,
  organizerId: IDS.ORGANIZER_ID,
  title: "Sold Out Gig - Kolkata",
  description: "A sold-out event for waitlist testing.",
  category: "JAM_GIG" as const,
  categories: ["JAM_GIG"] as const,
  city: "KOLKATA" as const,
  venueName: "Test Venue",
  venueAddress: "Test Address, Kolkata",
  startsAt: futureDate(20),
  endsAt: futureDate(20, 22),
  pricingMode: "PAID" as const,
  feePayer: "BUYER" as const,
  status: "PUBLISHED" as const,
  terms: ["No refunds"],
  thingsToKnow: ["Small venue"],
  tags: ["hip-hop", "jam"],
  registrationsCount: 5,
  isFeatured: false,
  cardPosterUrl: null,
  bannerPosterUrl: null,
  latitude: null,
  longitude: null,
  googleMapsLink: null,
  commissionBps: 1000,
  commissionEnabled: true,
  convenienceFeeBps: 200,
  convenienceFeeEnabled: true,
  needsDoorStaff: false,
  waitlistEnabled: true,
  allowBookingDuringEvent: false,
  contactEmail: "organizer@outsiderr.test",
  contactPhone: "9000000002",
  instagramUrl: null,
  youtubeUrl: null,
  xUrl: null,
  facebookUrl: null,
  linkedinUrl: null,
  photoUrls: [],
};

export const freeTier = {
  id: IDS.FREE_TIER_ID,
  eventId: IDS.FREE_EVENT_ID,
  name: "Entry",
  pricePaise: 0,
  quantity: 100,
  quantitySold: 0,
  quantityReserved: 0,
  perks: [],
  sortOrder: 0,
  tierType: "FLAT" as const,
  phaseOrder: null,
  phaseOpensAt: null,
  phaseClosesAt: null,
};

export const paidGeneralTier = {
  id: IDS.PAID_GENERAL_TIER_ID,
  eventId: IDS.PAID_EVENT_ID,
  name: "General",
  pricePaise: 50000, // ₹500
  quantity: 50,
  quantitySold: 2, // 2 sold (online + box-office orders)
  quantityReserved: 0,
  perks: ["Entry", "Standing"],
  sortOrder: 0,
  tierType: "NAMED" as const,
  phaseOrder: null,
  phaseOpensAt: null,
  phaseClosesAt: null,
};

export const paidVipTier = {
  id: IDS.PAID_VIP_TIER_ID,
  eventId: IDS.PAID_EVENT_ID,
  name: "VIP",
  pricePaise: 200000, // ₹2000
  quantity: 10,
  quantitySold: 0,
  quantityReserved: 0,
  perks: ["Front row", "Meet & greet", "Free merch"],
  sortOrder: 1,
  tierType: "NAMED" as const,
  phaseOrder: null,
  phaseOpensAt: null,
  phaseClosesAt: null,
};

export const soldOutTier = {
  id: IDS.SOLD_OUT_TIER_ID,
  eventId: IDS.SOLD_OUT_EVENT_ID,
  name: "Entry",
  pricePaise: 50000, // ₹500
  quantity: 5,
  quantitySold: 5, // fully sold
  quantityReserved: 0,
  perks: [],
  sortOrder: 0,
  tierType: "FLAT" as const,
  phaseOrder: null,
  phaseOpensAt: null,
  phaseClosesAt: null,
};

// Online order: 1 ticket at ₹500 (General tier of paid event)
// Financial breakdown (dual-fee model):
//   subtotal:      50,000 paise (₹500)
//   commission:    5,000 paise (10%)
//   convenience:   1,000 paise (2%)
//   platform fee:  6,000 paise
//   organizer:    45,000 paise
//   buyer total:  51,000 paise
export const onlineOrder = {
  id: IDS.ONLINE_ORDER_ID,
  eventId: IDS.PAID_EVENT_ID,
  eventTitle: "Underground Dance Battle - Delhi",
  tierId: IDS.PAID_GENERAL_TIER_ID,
  tierName: "General",
  userId: IDS.REGULAR_USER_ID,
  quantity: 1,
  unitPricePaise: 50000,
  subtotalPaise: 50000,
  platformFeePaise: 6000,
  commissionPaise: 5000,
  convenienceFeePaise: 1000,
  organizerPayoutPaise: 45000,
  totalPaise: 51000,
  feePayer: "BUYER" as const,
  status: "CONFIRMED" as const,
  utrReference: null,
  paymentProofUrl: null,
  razorpayOrderId: "rzp_test_order_001",
  razorpayPaymentId: "rzp_test_payment_001",
  paymentMethod: "upi",
  invoiceNumber: "INV-001",
  reservedAt: null,
  reservationExpiresAt: null,
  confirmedAt: futureDate(10),
  buyerName: "Test User",
  buyerPhone: "9000000003",
  buyerEmail: "user@outsiderr.test",
  buyerGender: null,
  rejectionReason: null,
  createdAt: futureDate(10),
  orderSource: null,
  isBoxOffice: false,
};

// Box-office order: 1 ticket at ₹500 (General tier of paid event)
// No convenience fee for box-office orders.
//   subtotal:      50,000 paise (₹500)
//   commission:    5,000 paise (10%)
//   convenience:   0 paise
//   platform fee:  5,000 paise
//   organizer:    45,000 paise
//   buyer total:  50,000 paise
export const boxOfficeOrder = {
  id: IDS.BOX_OFFICE_ORDER_ID,
  eventId: IDS.PAID_EVENT_ID,
  eventTitle: "Underground Dance Battle - Delhi",
  tierId: IDS.PAID_GENERAL_TIER_ID,
  tierName: "General",
  userId: null, // walk-in order
  quantity: 1,
  unitPricePaise: 50000,
  subtotalPaise: 50000,
  platformFeePaise: 5000,
  commissionPaise: 5000,
  convenienceFeePaise: 0,
  organizerPayoutPaise: 45000,
  totalPaise: 50000,
  feePayer: "BUYER" as const,
  status: "CONFIRMED" as const,
  utrReference: null,
  paymentProofUrl: null,
  razorpayOrderId: null,
  razorpayPaymentId: null,
  paymentMethod: "cash",
  invoiceNumber: "INV-002",
  reservedAt: null,
  reservationExpiresAt: null,
  confirmedAt: futureDate(5),
  buyerName: "Walk-in Attendee",
  buyerPhone: "9000000004",
  buyerEmail: null,
  buyerGender: null,
  rejectionReason: null,
  createdAt: futureDate(5),
  orderSource: "WALKIN_PREEVENT",
  isBoxOffice: true,
};

export const validTicket = {
  id: IDS.VALID_TICKET_ID,
  orderId: IDS.ONLINE_ORDER_ID,
  eventId: IDS.PAID_EVENT_ID,
  eventTitle: "Underground Dance Battle - Delhi",
  tierName: "General",
  qrHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  status: "VALID" as const,
  checkedInAt: null,
  startsAt: futureDate(45),
  venueName: "Connaught Place",
  organizerContactEmail: "organizer@outsiderr.test",
};

export const usedTicket = {
  id: IDS.USED_TICKET_ID,
  orderId: IDS.BOX_OFFICE_ORDER_ID,
  eventId: IDS.PAID_EVENT_ID,
  eventTitle: "Underground Dance Battle - Delhi",
  tierName: "General",
  qrHash: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b200",
  status: "USED" as const,
  checkedInAt: futureDate(5),
  startsAt: futureDate(45),
  venueName: "Connaught Place",
  organizerContactEmail: "organizer@outsiderr.test",
};

// PINs (plaintext for test fixtures — real DB stores hashes)
export const scannerPin = {
  id: IDS.SCANNER_PIN_ID,
  eventId: IDS.PAID_EVENT_ID,
  organizerId: IDS.ORGANIZER_ID,
  pinCode: "123456",
  pinHash: null, // computed by the DB
  staffName: "Door Scanner 1",
  role: "ORGANIZER" as const,
  isActive: true,
  lastUsedAt: null,
};

export const boxOfficePin = {
  id: IDS.BOX_OFFICE_PIN_ID,
  eventId: IDS.PAID_EVENT_ID,
  organizerId: IDS.ORGANIZER_ID,
  pinCode: "654321",
  pinHash: null,
  staffName: "Box Office 1",
  role: "ORGANIZER" as const,
  isActive: true,
  lastUsedAt: null,
};

// ============================================================
// Convenience collections
// ============================================================
export const allEvents = [freeEvent, paidEvent, soldOutEvent];
export const allTiers = [freeTier, paidGeneralTier, paidVipTier, soldOutTier];
export const allOrders = [onlineOrder, boxOfficeOrder];
export const allTickets = [validTicket, usedTicket];
export const allUsers = [adminUser, organizerOwner, regularUser];

// ============================================================
// Financial expectations (for test assertions)
// ============================================================
export const FINANCIAL_EXPECTATIONS = {
  // Online order: 1 × ₹500
  online: {
    subtotal: 50000,
    commission: 5000, // 10%
    convenienceFee: 1000, // 2%
    platformFee: 6000, // commission + convenience
    organizerPayout: 45000, // subtotal - commission
    buyerTotal: 51000, // subtotal + convenience
  },
  // Box-office order: 1 × ₹500 (no convenience fee)
  boxOffice: {
    subtotal: 50000,
    commission: 5000,
    convenienceFee: 0,
    platformFee: 5000,
    organizerPayout: 45000,
    buyerTotal: 50000,
  },
  // Canonical 10 × ₹450 example
  canonical: {
    unitPrice: 45000,
    quantity: 10,
    subtotal: 450000,
    commission: 45000,
    convenienceFee: 9000,
    platformFee: 54000,
    organizerPayout: 405000,
    buyerTotal: 459000,
  },
} as const;
