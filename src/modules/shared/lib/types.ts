export type EventCategory =
  | "CYPHER_BATTLE"
  | "SKATE_STUNT"
  | "FITNESS"
  | "JAM_GIG" // legacy - removed from chips; kept so existing events/profiles typecheck
  | "WORKSHOP"
  | "HIP_HOP_PARTY"
  | "TECHNO_RAVE"
  | "CAR_BIKE_MEET"
  | "GAMING"
  | "OTHER";

/** Any Indian city key (UPPERCASE canonical). Legacy four are still valid. */
export type City = string;

export type FeePayer = "BUYER" | "ORGANIZER";

export type PricingMode = "FREE" | "FLAT" | "PAID" | "PHASED";

export type TierType = "NAMED" | "FLAT_PHASE";

export type EventStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CANCELLATION_REQUESTED"
  | "CANCELLED"
  | "POSTPONED";

export type RefundStatus =
  | "REQUESTED"       // organizer/admin requested - awaiting admin review
  | "PENDING"         // approved - queued for the refund worker
  | "INITIATING"      // worker claimed - calling Razorpay
  | "INITIATED"       // Razorpay accepted - awaiting gateway callback
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"        // admin rejected the request
  | "MANUAL_SETTLED"; // settled offline (legacy manual-UPI orders)

export interface RefundRecord {
  id: string;
  orderId: string;
  eventId: string;
  userId: string;
  amountPaise: number;
  platformFeePaise: number;
  status: RefundStatus;
  reason: string;
  initiatedAt: string;
  completedAt: string | null;
}

export type OrderStatus =
  | "PENDING_VERIFICATION" // legacy manual UPI flow (kept for historical orders)
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED"
  | "REFUNDED"
  | "RESERVED"   // Razorpay: inventory held, awaiting payment
  | "EXPIRED"    // Razorpay: reservation timed out
  | "FAILED"     // Razorpay: payment failed
  | "REFUND_REQUESTED"; // User requested refund for postponed event

export type TicketStatus = "VALID" | "USED" | "VOID" | "CANCELLED";

export type ThemePreference = "dark" | "light" | "system";

export interface PlatformSetting {
  key: string;
  value: string | number | boolean | Record<string, number>;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export type DoorStaffPaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type DoorStaffServiceStatus = "REQUESTED" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface DoorStaffOrder {
  id: string;
  eventId: string;
  eventTitle?: string;
  organizerId: string;
  numberOfStaff: number;
  serviceAmountPaise: number;
  paymentStatus: DoorStaffPaymentStatus;
  serviceStatus: DoorStaffServiceStatus;
  utrReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Organizer {
  id: string;
  ownerId: string;
  name: string;
  bio: string | null;
  description: string | null;
  organizerIntent?: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  upiId: string | null;
  upiQrUrl: string | null;
  verified: boolean;
  panNumber?: string | null;
  panName?: string | null;
  panDocumentUrl?: string | null;
  gstNumber?: string | null;
  gstBusinessName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankAccountName?: string | null;
  bankAccountType?: string | null;
  bankDocumentUrl?: string | null;
  /** Saved payout bank accounts (organizer_bank_accounts). */
  bankAccounts?: {
    id: string;
    label: string | null;
    accountName: string;
    accountNumber: string;
    ifsc: string;
    accountType: string | null;
    isDefault: boolean;
  }[];
  /** Staged KYC/payout edits awaiting admin re-verification (column → new value). */
  pendingKyc?: Record<string, string | null> | null;
  rejectionCount?: number;
  kycStatus?: string; // NOT_SUBMITTED | PENDING | APPROVED | REJECTED | CLARIFICATION_NEEDED
  kycReviewedAt?: string | null;
  kycReviewNote?: string | null;
  kycResponseNote?: string | null;
  kycResponseDocumentUrl?: string | null;
  /** Premium analytics subscription expiry - premium when > now(). */
  premiumUntil?: string | null;
}

export interface UserProfile {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  birthDate: string | null;
  gender: string | null;
  interestedTags: string[];
  instagramUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
}

export interface TicketTier {
  id: string;
  eventId: string;
  name: string;
  pricePaise: number;
  quantity: number;
  quantitySold: number;
  quantityReserved?: number;
  perks: string[];
  sortOrder: number;
  /** Group ticket: one unit admits N people (1 = regular ticket). */
  admits?: number;
  tierType?: TierType;
  phaseOrder?: number | null;
  phaseOpensAt?: string | null;
  phaseClosesAt?: string | null;
}

export interface EventSummary {
  id: string;
  title: string;
  category: EventCategory;
  categories: EventCategory[];
  city: City;
  venueName: string;
  startsAt: string;
  endsAt?: string | null;
  cardPosterUrl: string | null;
  bannerPosterUrl: string | null;
  teaserVideoUrl: string | null;
  minPricePaise: number;
  isFeatured: boolean;
  registrationsCount: number;
  tags: string[];
  status?: EventStatus;
  pricingMode: PricingMode;
  totalCapacity?: number;
  ticketsSold?: number;
  /** Organizer-set per-account ticket cap for this event (1-10). */
  maxTicketsPerUser?: number;
}

export interface EventDetail extends EventSummary {
  description: string;
  thingsToKnow: string[];
  venueAddress: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsLink: string | null;
  endsAt: string | null;
  feePayer: FeePayer;
  commissionBps: number;
  commissionEnabled: boolean;
  convenienceFeeBps: number;
  convenienceFeeEnabled: boolean;
  status: EventStatus;
  needsDoorStaff: boolean;
  waitlistEnabled: boolean;
  allowBookingDuringEvent: boolean;
  terms: string[];
  organizer: Organizer;
  communityId?: string | null;
  payoutAccountId?: string | null;
  visibility?: "OPEN" | "MEMBERS_ONLY" | "INVITE_ONLY";
  promoterMode?: "NONE" | "LINK" | "PROMO_CODE";
  promoterCommissionBps?: number;
  promoBuyerDiscountBps?: number;
  promoPromoterBps?: number;
  community?: { id: string; name: string; avatarUrl: string | null; membershipType: JoinMode } | null;
  tiers: TicketTier[];
  photoUrls: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  linkedPastEventIds: string[];
}

export interface Order {
  id: string;
  eventId: string;
  eventTitle: string;
  tierId: string;
  tierName: string;
  userId: string | null;
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
  platformFeePaise: number;
  commissionPaise: number;
  convenienceFeePaise: number;
  organizerPayoutPaise: number;
  totalPaise: number;
  feePayer: FeePayer;
  status: OrderStatus;
  utrReference: string | null;
  paymentProofUrl: string | null;
  // Razorpay integration fields
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paymentMethod: string | null;
  invoiceNumber: string | null;
  reservedAt: string | null;
  reservationExpiresAt: string | null;
  confirmedAt: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  buyerEmail: string | null;
  buyerGender: string | null;
  rejectionReason: string | null;
  createdAt: string;
  eventStatus?: string;
  eventStartsAt?: string;
  orderSource?: string | null;
  isBoxOffice?: boolean;
  /** Refund/keep offer from a postponement, date change, or cross-city move. */
  refundOffered?: boolean;
  refundOfferReason?: string | null;
}

export interface Ticket {
  id: string;
  orderId: string;
  eventId: string;
  eventTitle: string;
  tierName: string;
  qrHash: string;
  status: TicketStatus;
  checkedInAt: string | null;
  startsAt: string;
  endsAt?: string | null;
  venueName: string;
  organizerContactEmail?: string | null;
}

export type ScanOutcome = "VALID" | "ALREADY_USED" | "INVALID" | "CANCELLED" | "WRONG_EVENT" | "DUPLICATE_CONFLICT";

export interface ScanResult {
  outcome: ScanOutcome;
  message: string;
  ticket?: {
    eventTitle: string;
    tierName: string;
    holderName: string | null;
    holderEmail: string | null;
    holderPhone: string | null;
    quantity: number;
    checkedInAt: string | null;
  };
}

export type BoostStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED";
export type WaitlistStatus = "WAITING" | "OFFERED" | "EXPIRED";

export interface EventReview {
  id: string;
  eventId: string;
  eventTitle: string;
  organizerId: string;
  userId: string;
  userName: string | null;
  userAvatarUrl: string | null;
  rating: number; // 1-5
  reviewText: string | null;
  createdAt: string;
}

export interface OrganizerRating {
  averageRating: number; // 0 if no reviews
  totalReviews: number;
  // Distribution: index 0 = 1 star, index 4 = 5 stars
  distribution: number[];
}

export interface Boost {
  id: string;
  eventId: string;
  organizerId: string;
  slot: number;
  amountPaidPaise: number;
  status: BoostStatus;
  startsAt: string;
  endsAt: string;
  utrReference: string | null;
  createdAt: string;
}

export interface BoostSlotPrice {
  slot: number;
  pricePaise: number;
}

export interface WaitlistEntry {
  id: string;
  eventId: string;
  tierId: string;
  userId: string;
  position: number;
  status: WaitlistStatus;
  offeredAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

export interface EventAnalytics {
  eventId: string;
  eventTitle: string;
  totalOrders: number;
  confirmedOrders: number;
  pendingOrders: number;
  rejectedOrders: number;
  grossRevenuePaise: number;       // subtotal (ticket face value × qty)
  commissionPaise: number;         // organizer commission deducted
  convenienceFeePaise: number;     // buyer convenience fee added
  platformFeePaise: number;        // commission + convenience (total platform revenue)
  netPayoutPaise: number;          // what organizer receives = subtotal - commission
  checkIns: number;
  waitlistCount: number;
  salesByDay: { date: string; orders: number; tickets: number; revenuePaise: number }[];
  tierBreakdown: TierAnalytics[];
}

export interface TierAnalytics {
  tierId: string;
  tierName: string;
  tierType: string;
  pricePaise: number;
  quantity: number;
  quantitySold: number;
  quantityLeft: number;
  phaseOpensAt?: string | null;
  phaseClosesAt?: string | null;
}

export interface AdminStats {
  totalEvents: number;
  activeEvents: number;
  totalOrders: number;
  confirmedOrders: number;
  pendingOrders: number;
  totalRevenuePaise: number;       // total_paise (what buyers paid)
  grossRevenuePaise: number;       // subtotal_paise (ticket sales before fees)
  totalCommissionPaise: number;    // commission_paise (organizer commission)
  totalConvenienceFeePaise: number; // convenience_fee_paise (buyer convenience fee)
  totalPlatformFeePaise: number;   // commission + convenience (total platform revenue)
  totalOrganizerPayoutPaise: number; // what organizers receive
  activeBoosts: number;
  pendingBoosts: number;
}

export interface AdminOrder extends Order {
  eventTitle: string;
  organizerName: string;
}

export interface AdminEvent {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  city: City;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  organizerName: string;
  registrationsCount: number;
  isFeatured: boolean;
  pricingMode?: PricingMode;
  commissionBps: number;
  commissionEnabled: boolean;
  convenienceFeeBps: number;
  convenienceFeeEnabled: boolean;
  /** Confirmed-order aggregates - for admin sorting/reporting. */
  totalCommissionPaise?: number;
  totalConvenienceFeePaise?: number;
}

export interface AdminUser {
  id: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isOrganizer: boolean;
  isAdmin: boolean;
  /** True when the organizer's premium_until is in the future. */
  isPremium?: boolean;
  createdAt: string;
  birthDate?: string | null;
  interestedTags?: string[];
}

export interface BoostWithEvent extends Boost {
  eventTitle: string;
  organizerName: string;
}

// ── Communities & Crews ──────────────────────────────────────────────────────

export type CommunityType = "CLUB" | "CREW";
export type JoinMode = "OPEN" | "PRIVATE" | "INVITE_ONLY";
export type MembershipStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export interface Community {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  bio: string | null;
  type: CommunityType;
  category: string | null;
  city: City | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  galleryUrls: string[];
  instagramHandle: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  linkedinUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
  upiId: string | null;
  membershipType: JoinMode;
  membershipFeePaise: number;
  terms: string[];
  memberCount: number;
  verified: boolean;
  createdAt: string;
}

export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  userName: string;
  status: MembershipStatus;
  instagramLink: string | null;
  utrReference: string | null;
  inviteCode: string | null;
  imported: boolean;
  createdAt: string;
}

export interface CommunityJoinQuestion {
  id: string;
  communityId: string;
  question: string;
  isMandatory: boolean;
  sortOrder: number;
}

export interface CommunityJoinAnswer {
  memberId: string;
  question: string;
  answer: string;
}

// ── Hero Boosts ───────────────────────────────────────────────────────

export type HeroBoostStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED" | "REFUNDED" | "FAILED";

export interface HeroBoost {
  id: string;
  eventId: string;
  organizerId: string;
  status: HeroBoostStatus;
  amountPaise: number;
  currency: string;
  utrReference: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  createdAt: string;
}

export interface HeroBoostWithEvent extends HeroBoost {
  eventTitle: string;
  eventStartsAt: string;
  eventStatus: string;
  organizerName: string;
}

export interface HeroEvent extends EventSummary {
  heroBoostId: string;
  heroStartedAt: string;
  heroExpiresAt: string;
}

// ── Razorpay: Payment ledger, payouts, webhook events ─────────────────

export type LedgerType = "TICKET_SALE" | "BOOST_SALE" | "REFUND" | "PAYOUT" | "ADJUSTMENT";

export interface PaymentLedgerEntry {
  id: string;
  orderId: string | null;
  eventId: string | null;
  organizerId: string | null;
  type: LedgerType;
  grossAmountPaise: number;
  commissionPaise: number;
  convenienceFeePaise: number;
  razorpayFeePaise: number;
  refundAmountPaise: number;
  netOrganizerPaise: number;
  netPlatformPaise: number;
  razorpayPaymentId: string | null;
  razorpayRefundId: string | null;
  notes: string | null;
  createdAt: string;
}

export type PayoutStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface PayoutRecord {
  id: string;
  organizerId: string;
  eventId: string | null;
  amountPaise: number;
  status: PayoutStatus;
  bankReference: string | null;
  notes: string | null;
  initiatedBy: string | null;
  initiatedAt: string;
  completedAt: string | null;
}

export interface WebhookEvent {
  id: string;
  razorpayEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  orderId: string | null;
  processed: boolean;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
}

// ── Razorpay: Checkout session returned by createCheckoutAction ───────

export interface CheckoutSession {
  orderId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  eventTitle: string;
  tierName: string;
  quantity: number;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  /** payment_intents.id - ties the modal to the dispatcher. */
  intentId?: string | null;
  /** Reservation expiry - Razorpay checkout/retry can't outlast this. */
  expiresAt?: string | null;
}

// ── Promoter program ────────────────────────────────────────────────────────
export type PromoterEarningView = {
  id: string;
  eventTitle: string;
  via: string;
  kind: "EARNING" | "CLAWBACK";
  amountPaise: number;
  status: string;
  createdAt: string;
};

export type PromoterDashboard = {
  isPromoter: boolean;
  payoutReady: boolean;
  payouts: { id: string; amountPaise: number; status: string; initiatedAt: string }[];
  balances: {
    clicks: number;
    redemptions: number;
    earnedPaise: number;
    payablePaise: number;
    paidPaise: number;
    clawedPaise: number;
  };
  programs: {
    eventId: string;
    eventTitle: string;
    mode: "LINK" | "PROMO_CODE";
    slug?: string;
    code?: string;
    clicks: number;
    salesPaise: number;
    earnedPaise: number;
  }[];
  earnings: PromoterEarningView[];
  hasPayoutDetails: boolean;
  masked: { account: string | null; ifsc: string | null; pan: string | null; upi: string | null };
};
