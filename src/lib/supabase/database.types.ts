import type {
  City,
  EventCategory,
  EventStatus,
  FeePayer,
  OrderStatus,
  PricingMode,
  RefundStatus,
  ThemePreference,
  TicketStatus,
} from "@/lib/types";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  birth_date: string | null;
  interested_tags: string[];
  instagram_url: string | null;
  youtube_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  theme_preference: ThemePreference;
  is_organizer: boolean;
  is_admin: boolean;
  created_at: string;
}

export type OrganizerRow = {
  id: string;
  owner_id: string;
  name: string;
  bio: string | null;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  upi_id: string | null;
  upi_qr_url: string | null;
  verified: boolean;
  created_at: string;
}

export type EventRow = {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  things_to_know: string[];
  category: EventCategory;
  city: City;
  venue_name: string;
  venue_address: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_link: string | null;
  starts_at: string;
  ends_at: string | null;
  card_poster_url: string | null;
  banner_poster_url: string | null;
  fee_payer: FeePayer;
  status: EventStatus;
  is_featured: boolean;
  needs_door_staff: boolean;
  terms: string[];
  registrations_count: number;
  tags: string[];
  photo_urls: string[];
  pricing_mode: PricingMode;
  contact_email: string | null;
  contact_phone: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  created_at: string;
}

export type TicketTierRow = {
  id: string;
  event_id: string;
  name: string;
  price_paise: number;
  quantity: number;
  quantity_sold: number;
  perks: string[];
  sort_order: number;
  tier_type: string;
  phase_order: number | null;
  phase_opens_at: string | null;
  phase_closes_at: string | null;
}

export type OrderRow = {
  id: string;
  event_id: string;
  tier_id: string;
  user_id: string;
  quantity: number;
  unit_price_paise: number;
  subtotal_paise: number;
  platform_fee_paise: number;
  total_paise: number;
  fee_payer: FeePayer;
  status: OrderStatus;
  utr_reference: string | null;
  payment_proof_url: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  buyer_gender: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type TicketRow = {
  id: string;
  order_id: string;
  event_id: string;
  tier_id: string;
  user_id: string;
  qr_hash: string;
  status: TicketStatus;
  checked_in_at: string | null;
  checked_in_by: string | null;
  created_at: string;
}

export type WaitlistRow = {
  id: string;
  event_id: string;
  tier_id: string;
  user_id: string;
  position: number;
  status: string;
  offered_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export type BoostRow = {
  id: string;
  event_id: string;
  organizer_id: string;
  slot: number;
  amount_paid_paise: number;
  status: string;
  starts_at: string;
  ends_at: string;
  utr_reference: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type BoostSlotPriceRow = {
  slot: number;
  price_paise: number;
}

export type ClubRow = {
  id: string;
  owner_id: string;
  name: string;
  bio: string | null;
  type: string;
  city: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  instagram_handle: string | null;
  upi_id: string | null;
  membership_type: string;
  membership_fee_paise: number;
  terms: string[];
  member_count: number;
  verified: boolean;
  created_at: string;
}

export type LegalPageRow = {
  slug: string;
  title: string;
  content: string;
  version: number;
  is_published: boolean;
  updated_at: string;
  updated_by: string | null;
}

export type HeroBoostRow = {
  id: string;
  event_id: string;
  organizer_id: string;
  status: string;
  amount_paise: number;
  currency: string;
  utr_reference: string | null;
  started_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ClubMemberRow = {
  id: string;
  club_id: string;
  user_id: string;
  status: string;
  instagram_link: string | null;
  utr_reference: string | null;
  created_at: string;
}

export type PlatformSettingRow = {
  key: string;
  value: string | number | boolean | Record<string, number>;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type EventTermsAcceptanceRow = {
  id: string;
  organizer_id: string;
  event_id: string | null;
  terms_version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export type DoorStaffOrderRow = {
  id: string;
  event_id: string;
  organizer_id: string;
  number_of_staff: number;
  service_amount_paise: number;
  payment_status: string;
  service_status: string;
  utr_reference: string | null;
  created_at: string;
  updated_at: string;
}

export type RefundRow = {
  id: string;
  order_id: string;
  event_id: string;
  user_id: string;
  amount_paise: number;
  platform_fee_paise: number;
  status: RefundStatus;
  reason: string;
  initiated_at: string;
  completed_at: string | null;
}

export type EventNotificationRow = {
  id: string;
  event_id: string;
  user_id: string;
  type: "CANCELLATION" | "POSTPONEMENT" | "RESCHEDULE" | "WAITLIST_OFFER" | "VENUE_CHANGE" | "CITY_CHANGE" | "TIME_CHANGE";
  message: string;
  read: boolean;
  created_at: string;
}

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      organizers: Table<OrganizerRow, "owner_id" | "name">;
      events: Table<
        EventRow,
        "organizer_id" | "title" | "category" | "city" | "venue_name" | "starts_at"
      >;
      ticket_tiers: Table<TicketTierRow, "event_id" | "name" | "price_paise" | "quantity">;
      orders: Table<
        OrderRow,
        "event_id" | "tier_id" | "user_id" | "quantity" | "unit_price_paise"
      >;
      tickets: Table<TicketRow, "order_id" | "event_id" | "tier_id" | "user_id" | "qr_hash">;
      waitlist: Table<WaitlistRow, "event_id" | "tier_id" | "user_id" | "position">;
      push_subscriptions: Table<PushSubscriptionRow, "user_id" | "endpoint" | "p256dh" | "auth">;
      boosts: Table<BoostRow, "event_id" | "organizer_id" | "slot" | "amount_paid_paise" | "starts_at" | "ends_at">;
      boost_slot_prices: Table<BoostSlotPriceRow, "slot" | "price_paise">;
      clubs: Table<ClubRow, "owner_id" | "name" | "type" | "membership_type">;
      club_members: Table<ClubMemberRow, "club_id" | "user_id" | "status">;
      refunds: Table<RefundRow, "order_id" | "event_id" | "user_id" | "amount_paise" | "platform_fee_paise" | "status" | "reason" | "initiated_at">;
      event_notifications: Table<EventNotificationRow, "event_id" | "user_id" | "type" | "message">;
      platform_settings: Table<PlatformSettingRow, "key" | "value">;
      event_terms_acceptances: Table<EventTermsAcceptanceRow, "organizer_id" | "terms_version">;
      door_staff_orders: Table<DoorStaffOrderRow, "event_id" | "organizer_id" | "number_of_staff" | "service_amount_paise">;
      legal_pages: Table<LegalPageRow, "slug" | "title" | "content">;
      hero_boosts: Table<HeroBoostRow, "event_id" | "organizer_id" | "amount_paise">;
    };
    Views: Record<string, never>;
    Functions: {
      approve_order: {
        Args: { p_order_id: string };
        Returns: TicketRow[];
      };
      reject_order: {
        Args: { p_order_id: string; p_reason: string | null };
        Returns: OrderRow;
      };
      create_free_order: {
        Args: {
          p_event_id: string;
          p_tier_id: string;
          p_quantity: number;
          p_buyer_name: string | null;
          p_buyer_phone: string | null;
          p_buyer_email: string | null;
          p_buyer_gender: string | null;
        };
        Returns: OrderRow;
      };
      create_paid_order: {
        Args: {
          p_event_id: string;
          p_tier_id: string;
          p_quantity: number;
          p_unit_price_paise: number;
          p_subtotal_paise: number;
          p_platform_fee_paise: number;
          p_total_paise: number;
          p_fee_payer: string;
          p_utr_reference: string | null;
          p_payment_proof_url: string | null;
          p_buyer_name: string | null;
          p_buyer_phone: string | null;
          p_buyer_email: string | null;
          p_buyer_gender: string | null;
        };
        Returns: OrderRow;
      };
      check_in_ticket: {
        Args: { p_qr_hash: string; p_event_id: string };
        Returns: {
          outcome: "VALID" | "ALREADY_USED" | "INVALID";
          event_title: string | null;
          tier_name: string | null;
          holder_name: string | null;
          checked_in_at: string | null;
        }[];
      };
      offer_waitlist_next: {
        Args: { p_tier_id: string };
        Returns: WaitlistRow;
      };
      increment_club_member_count: {
        Args: { p_club_id: string };
        Returns: void;
      };
      cancel_event: {
        Args: {
          p_event_id: string;
          p_reason: string;
          p_cancellation_charge_percent: number;
        };
        Returns: {
          refund_count: number;
          total_refund_paise: number;
          total_platform_fee_paise: number;
          cancellation_charge_paise: number;
          organizer_owes_paise: number;
        }[];
      };
      postpone_event: {
        Args: {
          p_event_id: string;
          p_new_starts_at: string;
          p_new_ends_at: string | null;
          p_reason: string;
        };
        Returns: { notified_count: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
