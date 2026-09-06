import type { EventCategory, City } from "@/lib/types";

export const CATEGORIES: { value: EventCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "CYPHER_BATTLE", label: "Cyphers & Battles" },
  { value: "SKATE_STUNT", label: "Skate & Stunts" },
  { value: "FITNESS", label: "Fitness" },
  { value: "JAM_GIG", label: "Jams & Gigs" },
  { value: "HIP_HOP_PARTY", label: "Hip Hop Parties" },
  { value: "CAR_BIKE_MEET", label: "Car & Bike Meetups" },
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
export const MAX_TICKETS_PER_ORDER = 1;

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
  FITNESS: "Fitness",
  JAM_GIG: "Jams & Gigs",
  HIP_HOP_PARTY: "Hip Hop Parties",
  CAR_BIKE_MEET: "Car & Bike Meetups",
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
  "Run Club", "5K", "10K", "Marathon", "Walkathon", "Trail Run",
  // Gig / Jam
  "Live Music", "DJ Set", "Open Decks",
  // Hip Hop Party
  "Hip Hop Party", "Hip Hop", "Rap Party", "Trap Night", "Boom Bap Night",
  // Car & Bike Meet
  "Car Meet", "Bike Meet", "Motorcycle Meet", "JDM Meet", "Superbike Meet", "Riders Meet", "Cars & Coffee",
  // Workshop
  "Workshop", "Masterclass",
];
