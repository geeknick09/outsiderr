import type { EventCategory, City } from "./types";
import { ALL_INDIAN_CITIES } from "./india-cities";

export const CATEGORIES: { value: EventCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "CYPHER_BATTLE", label: "Cyphers & Battles" },
  { value: "SKATE_STUNT", label: "Skate & Stunts" },
  { value: "FITNESS", label: "Alternate Sports & Fitness" },
  { value: "HIP_HOP_PARTY", label: "Hip Hop/R&B" },
  { value: "TECHNO_RAVE", label: "Techno & Rave" },
  { value: "CAR_BIKE_MEET", label: "Car & Bike Meetups" },
  { value: "GAMING", label: "Gaming" },
  { value: "WORKSHOP", label: "Workshops" },
  { value: "OTHER", label: "Others" },
];

export const CITIES: { value: City; label: string; lat: number; lng: number }[] =
  ALL_INDIAN_CITIES;

export const DEFAULT_CITY: City = "KOLKATA";

/** Platform commission in basis points (5%). */
export const PLATFORM_FEE_BPS = 500;

/** Hard cap on tickets a single order may contain (absolute ceiling - the
 *  per-event `maxTicketsPerUser` cap, 1-10, is the real limit). */
export const MAX_TICKETS_PER_ORDER = 10;

export const MAX_FEATURED_EVENTS = 5;

export const DEFAULT_EVENT_TERMS = [
  "Please carry a valid ID proof along with you.",
  "No refunds on purchased ticket are possible, even in case of any rescheduling.",
  "Security procedures, including frisking remain the right of the management.",
  "No dangerous or potentially hazardous objects including but not limited to weapons, knives, guns, fireworks, helmets, lazer devices, bottles, musical instruments will be allowed in the venue and may be ejected with or without the owner from the venue.",
  "The sponsors/performers/organizers are not responsible for any injury or damage occurring due to the event. Any claims regarding the same would be settled in courts in Mumbai.",
  "People in an inebriated state may not be allowed entry.",
  "Organizers hold the right to deny late entry to the event.",
  "Venue rules apply.",
];

export const CITY_LABELS: Record<City, string> = CITIES.reduce(
  (acc, city) => ({ ...acc, [city.value]: city.label }),
  {} as Record<City, string>,
);

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  CYPHER_BATTLE: "Cyphers & Battles",
  SKATE_STUNT: "Skate & Stunts",
  FITNESS: "Alternate Sports & Fitness",
  JAM_GIG: "Jams & Gigs",
  HIP_HOP_PARTY: "Hip Hop/R&B",
  TECHNO_RAVE: "Techno & Rave",
  CAR_BIKE_MEET: "Car & Bike Meetups",
  GAMING: "Gaming",
  WORKSHOP: "Workshops",
  OTHER: "Others",
};

export const PREDEFINED_EVENT_TAGS: string[] = [
  // Access
  "Free Entry", "Limited Seats", "18+", "All Ages",
  // Setting
  "Outdoor", "Indoor", "Underground", "Street", "Collab",
  // Cypher / Battle / Rap
  "Cypher", "Rap Cypher", "Rap Battle", "Rap Concert", "Dance Battle", "Graffiti Cypher",
  "Freestyle", "Open Mic", "Beatbox",
  // Skate / Stunt / MTB
  "Skate", "Street Skate", "BMX", "MTB", "MTB Stunt", "Stunt Riding",
  // Fitness / Run
  "Run Community", "5K", "10K", "Marathon", "Walkathon", "Trail Run",
  // Gig / Jam
  "Live Music", "DJ Set", "Open Decks",
  // Hip Hop / R&B Party
  "Hip Hop Party", "Hip Hop", "Rap Party", "Trap Night", "Boom Bap Night", "R&B Night", "Afrobeats",
  // Techno / Rave
  "Techno", "Rave", "Warehouse Rave", "Coffee Rave", "Sundowner", "Boiler Set", "Psytrance", "Acid", "Melodic Techno",
  // Car & Bike Meet
  "Car Meet", "Bike Meet", "Motorcycle Meet", "JDM Meet", "Superbike Meet", "Riders Meet", "Cars & Coffee",
  // Gaming
  "Esports", "LAN Tournament", "FIFA Tournament", "BGMI", "Valorant", "Free Fire", "Call of Duty",
  "Fight Night", "Smash Bros", "Console Night", "Retro Gaming", "Arcade", "Speedrun",
  // Workshop
  "Workshop", "Masterclass",
];

/** Tags shown in the create-event picker per selected category (generic always shown). */
export const GENERIC_EVENT_TAGS: string[] = [
  "Free Entry", "Limited Seats", "18+", "All Ages",
  "Outdoor", "Indoor", "Underground", "Street", "Collab",
];

export const CATEGORY_TAGS: Record<EventCategory, string[]> = {
  CYPHER_BATTLE: ["Cypher", "Rap Cypher", "Rap Battle", "Rap Concert", "Dance Battle", "Graffiti Cypher", "Freestyle", "Open Mic", "Beatbox"],
  SKATE_STUNT: ["Skate", "Street Skate", "BMX", "MTB", "MTB Stunt", "Stunt Riding"],
  FITNESS: ["Run Community", "5K", "10K", "Marathon", "Walkathon", "Trail Run"],
  JAM_GIG: ["Live Music", "DJ Set", "Open Decks", "Open Mic", "Jam Session"],
  HIP_HOP_PARTY: ["Hip Hop Party", "Hip Hop", "Rap Party", "Trap Night", "Boom Bap Night", "R&B Night", "Afrobeats", "Cypher", "Freestyle"],
  TECHNO_RAVE: ["Techno", "Rave", "Warehouse Rave", "Coffee Rave", "Sundowner", "Boiler Set", "Psytrance", "Acid", "Melodic Techno"],
  CAR_BIKE_MEET: ["Car Meet", "Bike Meet", "Motorcycle Meet", "JDM Meet", "Superbike Meet", "Riders Meet", "Cars & Coffee"],
  GAMING: ["Esports", "LAN Tournament", "FIFA Tournament", "BGMI", "Valorant", "Free Fire", "Call of Duty", "Fight Night", "Smash Bros", "Console Night", "Retro Gaming", "Arcade", "Speedrun"],
  WORKSHOP: ["Workshop", "Masterclass"],
  OTHER: [],
};

/** Tags the form offers: generic + the union of every selected category's tags. */
export function tagsForCategories(categories: string[]): string[] {
  const set = new Set(GENERIC_EVENT_TAGS);
  for (const c of categories) {
    for (const t of CATEGORY_TAGS[c as EventCategory] ?? []) set.add(t);
    if (c === "OTHER") for (const t of PREDEFINED_EVENT_TAGS) set.add(t);
  }
  return [...set];
}

/** Community discovery categories — drives the home-page chips + community form select. */
export const COMMUNITY_CATEGORIES = [
  { value: "FITNESS", label: "Fitness & Movements" },
  { value: "HIP_HOP", label: "Hip Hop & Street Culture" },
  { value: "ELECTRONIC", label: "Electronic Music & Nightlife" },
  { value: "EXTREME_SPORTS", label: "Extreme Sports & Action" },
  { value: "GAMING", label: "Gaming & Esports" },
  { value: "FASHION", label: "Fashion & Sneaker Culture" },
  { value: "AUTOMOTIVE", label: "Automotive & Motor Culture" },
  { value: "ART_DESIGN", label: "Art, Design & Creators" },
] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]["value"];
