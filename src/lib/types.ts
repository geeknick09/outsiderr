export type EventCategory =
  | "JAM"
  | "BATTLE"
  | "GIG"
  | "WORKSHOP"
  | "STANDUP"
  | "SPORTS";

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
