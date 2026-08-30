import type {
  City,
  EventCategory,
  EventStatus,
  FeePayer,
  OrderStatus,
  ThemePreference,
  TicketStatus,
} from "@/lib/types";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  theme_preference: ThemePreference;
  is_organizer: boolean;
  created_at: string;
}

export type OrganizerRow = {
  id: string;
  owner_id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
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
      check_in_ticket: {
        Args: { p_qr_hash: string };
        Returns: {
          outcome: "VALID" | "ALREADY_USED" | "INVALID";
          event_title: string | null;
          tier_name: string | null;
          holder_name: string | null;
          checked_in_at: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
