import type { EventCategory, City } from "@/lib/types";

export const CATEGORIES: { value: EventCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "CYPHER_BATTLE", label: "Cyphers & Battles" },
  { value: "SKATE_STUNT", label: "Skate & Stunts" },
  { value: "MEETUP_RUN", label: "Meetups & Run Clubs" },
  { value: "JAM_GIG", label: "Jams & Gigs" },
  { value: "WORKSHOP", label: "Workshops" },
  { value: "OTHER", label: "Others" },
];

export const CITIES: { value: City; label: string; lat: number; lng: number }[] = [
  { value: "KOLKATA", label: "Kolkata", lat: 22.5726, lng: 88.3639 },
  { value: "MUMBAI", label: "Mumbai", lat: 19.076, lng: 72.8777 },
  { value: "DELHI", label: "Delhi", lat: 28.6139, lng: 77.209 },
  { value: "BENGALURU", label: "Bengaluru", lat: 12.9716, lng: 77.5946 },
];

export const DEFAULT_CITY: City = "KOLKATA";

/** Platform commission in basis points (5%). */
export const PLATFORM_FEE_BPS = 500;

/** Hard cap on tickets a single order may contain. */
export const MAX_TICKETS_PER_ORDER = 5;

export const MAX_FEATURED_EVENTS = 5;

export const DEFAULT_EVENT_TERMS = [
  "Entry is subject to a valid ticket QR code; one scan per ticket.",
  "Tickets are non-refundable and non-transferable once the payment is verified.",
  "Attendees below 18 years must be accompanied by a guardian unless stated otherwise.",
  "The organizer reserves the right to deny entry for unruly or unsafe behaviour.",
  "Outside food, beverages and illegal substances are strictly prohibited.",
  "Event schedule and line-up are subject to change without prior notice.",
];

export const CITY_LABELS: Record<City, string> = CITIES.reduce(
  (acc, city) => ({ ...acc, [city.value]: city.label }),
  {} as Record<City, string>,
);

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  CYPHER_BATTLE: "Cyphers & Battles",
  SKATE_STUNT: "Skate & Stunts",
  MEETUP_RUN: "Meetups & Run Clubs",
  JAM_GIG: "Jams & Gigs",
  WORKSHOP: "Workshops",
  OTHER: "Others",
};
