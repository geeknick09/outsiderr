import { DEMO_EVENTS } from "@/lib/data/demo-data";
import type { AdminUser, Boost, Club, ClubMember, DoorStaffOrder, EventDetail, HeroBoost, Order, Ticket, WaitlistEntry } from "@/lib/types";
import type { LegalPage } from "@/lib/data/legal-pages";

/**
 * Process-local store backing demo mode (no Supabase credentials configured).
 * It is intentionally non-persistent: restarting the server resets it.
 */
interface DemoStore {
  events: EventDetail[];
  orders: Order[];
  tickets: Ticket[];
  waitlist: WaitlistEntry[];
  boosts: Boost[];
  clubs: Club[];
  clubMembers: ClubMember[];
  doorStaffOrders: DoorStaffOrder[];
  platformSettings: Record<string, { value: string; description: string | null }>;
  users: AdminUser[];
  legalPages: LegalPage[];
  heroBoosts: HeroBoost[];
}

const DEMO_CLUBS: Club[] = [
  {
    id: "club-kol-runners",
    ownerId: "org-basement",
    ownerName: "Basement Collective",
    name: "Kolkata Runners",
    bio: "Weekly 5K and 10K runs across the city. All paces welcome — we run together, we finish together.",
    type: "CLUB",
    city: "KOLKATA",
    avatarUrl: null,
    coverUrl: null,
    instagramHandle: "@kolrunners",
    upiId: null,
    membershipType: "FREE",
    membershipFeePaise: 0,
    terms: ["Show up at 6 AM every Sunday", "Bring your own water", "Be respectful to all paces"],
    memberCount: 42,
    verified: true,
    createdAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
  },
  {
    id: "club-cypher-crew",
    ownerId: "org-cypher",
    ownerName: "Cypher Nights",
    name: "Cypher Nights Crew",
    bio: "Underground rap crew. To join, send your Instagram with your best 16 bars. We'll review and get back.",
    type: "CREW",
    city: "KOLKATA",
    avatarUrl: null,
    coverUrl: null,
    instagramHandle: "@cyphernights",
    upiId: null,
    membershipType: "AUDITION",
    membershipFeePaise: 0,
    terms: ["Send your Instagram link", "Must have at least one freestyle video", "Crew reviews weekly"],
    memberCount: 12,
    verified: true,
    createdAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
  },
  {
    id: "club-skate-society",
    ownerId: "org-basement",
    ownerName: "Basement Collective",
    name: "Skate Society BLR",
    bio: "Bangalore's premier skate crew. Monthly membership covers skate park access and crew merch.",
    type: "CREW",
    city: "BENGALURU",
    avatarUrl: null,
    coverUrl: null,
    instagramHandle: "@skatesocietyblr",
    upiId: "skatesociety@upi",
    membershipType: "PAID",
    membershipFeePaise: 50000,
    terms: ["₹500/month membership", "Includes skate park access", "Crew merch included"],
    memberCount: 28,
    verified: true,
    createdAt: new Date(Date.now() - 45 * 86_400_000).toISOString(),
  },
];

/** Default platform settings seed for demo mode. */
const DEMO_PLATFORM_SETTINGS: Record<string, { value: string; description: string | null }> = {
  platform_fee_bps: { value: "500", description: "Platform commission in basis points (5%)" },
  cancellation_charge_percent: { value: "20", description: "Organizer cancellation charge as % of total tickets sold" },
  postponement_charge_percent: { value: "10", description: "Organizer postponement charge as % of refunded tickets" },
  door_staff_pricing: { value: '{"1":1500,"2":2500,"3":3500,"4":5000,"5":6500}', description: "Door staff pricing per staff count (in INR)" },
  door_staff_max: { value: "5", description: "Maximum door staff per event" },
  door_staff_available: { value: "10", description: "Total door staff currently available across all events" },
  boost_slot_prices: { value: '{"carousel_1":1000,"carousel_2":750,"carousel_3":500}', description: "Boost slot pricing per day (in INR)" },
  max_tickets_per_order: { value: "1", description: "Maximum tickets per single order" },
  terms_version: { value: '"organizer-v1.0"', description: "Current organizer terms & conditions version" },
  venue_announcement_deadline_hours: { value: "48", description: "Minimum hours before event to announce venue" },
  organizer_whatsapp_number: { value: "7980085212", description: "WhatsApp number for attendees to send payment screenshots" },
  hero_boost_enabled: { value: "true", description: "Enable/disable the Hero Boost feature" },
  hero_boost_price: { value: "99900", description: "Price for a 7-day Hero Boost in paise" },
  hero_boost_duration_days: { value: "7", description: "Hero Boost duration in days" },
  hero_rotation_interval_minutes: { value: "30", description: "Hero carousel rotation interval in minutes" },
  hero_max_visible_events: { value: "7", description: "Maximum Hero events displayed at once" },
};

const globalStore = globalThis as typeof globalThis & {
  __outsiderrDemoStore?: DemoStore;
};

export function demoStore(): DemoStore {
  globalStore.__outsiderrDemoStore ??= {
    events: DEMO_EVENTS.map((event) => ({
      ...event,
      tiers: event.tiers.map((tier) => ({ ...tier })),
    })),
    orders: [],
    tickets: [],
    waitlist: [],
    boosts: [],
    clubs: DEMO_CLUBS.map((c) => ({ ...c })),
    clubMembers: [],
    doorStaffOrders: [],
    platformSettings: { ...DEMO_PLATFORM_SETTINGS },
    users: [],
    legalPages: [],
    heroBoosts: [],
  };
  return globalStore.__outsiderrDemoStore;
}
