export type EventCategory =
  | "CYPHER_BATTLE"
  | "SKATE_STUNT"
  | "MEETUP_RUN"
  | "JAM_GIG"
  | "WORKSHOP"
  | "OTHER";

export type City = "KOLKATA" | "MUMBAI" | "DELHI" | "BENGALURU";

export type FeePayer = "BUYER" | "ORGANIZER";

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

export type OrderStatus =
  | "PENDING_VERIFICATION"
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED";

export type TicketStatus = "VALID" | "USED" | "VOID";

export type ThemePreference = "dark" | "light" | "system";

export interface Organizer {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  upiId: string | null;
  upiQrUrl: string | null;
  verified: boolean;
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
}

export interface EventSummary {
  id: string;
  title: string;
  category: EventCategory;
  city: City;
  venueName: string;
  startsAt: string;
  cardPosterUrl: string | null;
  bannerPosterUrl: string | null;
  minPricePaise: number;
  isFeatured: boolean;
  registrationsCount: number;
  tags: string[];
  status?: EventStatus;
}

export interface EventDetail extends EventSummary {
  description: string;
  thingsToKnow: string[];
  venueAddress: string;
  latitude: number | null;
  longitude: number | null;
  endsAt: string | null;
  feePayer: FeePayer;
  status: EventStatus;
  needsDoorStaff: boolean;
  terms: string[];
  organizer: Organizer;
  tiers: TicketTier[];
  photoUrls: string[];
}

export interface Order {
  id: string;
  eventId: string;
  eventTitle: string;
  tierId: string;
  tierName: string;
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
}

export type ScanOutcome = "VALID" | "ALREADY_USED" | "INVALID";

export interface ScanResult {
  outcome: ScanOutcome;
  message: string;
  ticket?: {
    eventTitle: string;
    tierName: string;
    holderName: string | null;
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
  grossRevenuePaise: number;
  platformFeePaise: number;
  netPayoutPaise: number;
  checkIns: number;
  waitlistCount: number;
}

export interface AdminStats {
  totalEvents: number;
  activeEvents: number;
  totalOrders: number;
  pendingOrders: number;
  totalRevenuePaise: number;
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
  category: EventCategory;
  city: City;
  status: EventStatus;
  startsAt: string;
  organizerName: string;
  registrationsCount: number;
  isFeatured: boolean;
}

export interface AdminUser {
  id: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isOrganizer: boolean;
  isAdmin: boolean;
  createdAt: string;
}

export interface BoostWithEvent extends Boost {
  eventTitle: string;
  organizerName: string;
}
