export type EventCategory =
  | "CYPHER_BATTLE"
  | "SKATE_STUNT"
  | "FITNESS"
  | "JAM_GIG"
  | "WORKSHOP"
  | "HIP_HOP_PARTY"
  | "CAR_BIKE_MEET"
  | "OTHER";

export type City = "KOLKATA" | "MUMBAI" | "DELHI" | "BENGALURU";

export type FeePayer = "BUYER" | "ORGANIZER";

export type PricingMode = "FREE" | "FLAT" | "PAID" | "PHASED";

export type TierType = "NAMED" | "FLAT_PHASE";

export type EventStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CANCELLATION_REQUESTED"
  | "CANCELLED"
  | "POSTPONED";

export type RefundStatus = "PENDING" | "INITIATED" | "COMPLETED" | "FAILED";

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
  | "PENDING_VERIFICATION"
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED"
  | "REFUNDED";

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
  gstNumber?: string | null;
  gstBusinessName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankAccountName?: string | null;
  bankAccountType?: string | null;
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
  perks: string[];
  sortOrder: number;
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
  minPricePaise: number;
  isFeatured: boolean;
  registrationsCount: number;
  tags: string[];
  status?: EventStatus;
  pricingMode: PricingMode;
  totalCapacity?: number;
  ticketsSold?: number;
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
  terms: string[];
  organizer: Organizer;
  tiers: TicketTier[];
  photoUrls: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
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
  totalPaise: number;
  feePayer: FeePayer;
  status: OrderStatus;
  utrReference: string | null;
  paymentProofUrl: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  buyerEmail: string | null;
  buyerGender: string | null;
  rejectionReason: string | null;
  createdAt: string;
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
  venueName: string;
  organizerContactEmail?: string | null;
}

export type ScanOutcome = "VALID" | "ALREADY_USED" | "INVALID";

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
}

export interface AdminStats {
  totalEvents: number;
  activeEvents: number;
  totalOrders: number;
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
}

export interface AdminUser {
  id: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isOrganizer: boolean;
  isAdmin: boolean;
  createdAt: string;
  birthDate?: string | null;
  interestedTags?: string[];
}

export interface BoostWithEvent extends Boost {
  eventTitle: string;
  organizerName: string;
}

// ── Clubs & Crews ──────────────────────────────────────────────────────

export type ClubType = "CLUB" | "CREW";
export type MembershipType = "FREE" | "PAID" | "AUDITION";
export type MembershipStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export interface Club {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  bio: string | null;
  type: ClubType;
  city: City | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  instagramHandle: string | null;
  upiId: string | null;
  membershipType: MembershipType;
  membershipFeePaise: number;
  terms: string[];
  memberCount: number;
  verified: boolean;
  createdAt: string;
}

export interface ClubMember {
  id: string;
  clubId: string;
  userId: string;
  userName: string;
  status: MembershipStatus;
  instagramLink: string | null;
  utrReference: string | null;
  createdAt: string;
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
