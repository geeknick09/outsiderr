import "server-only";

import { MAX_FEATURED_EVENTS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type {
  EventRow,
  OrganizerRow,
  TicketTierRow,
} from "@/lib/supabase/database.types";
import type {
  City,
  EventCategory,
  EventDetail,
  EventSummary,
  Organizer,
  PricingMode,
  TicketTier,
  TierType,
} from "@/lib/types";

export interface EventQuery {
  city?: City;
  category?: EventCategory;
  search?: string;
}

function toOrganizer(row: OrganizerRow): Organizer {
  return {
    id: row.id,
    name: row.name,
    bio: row.bio,
    description: (row as { description?: string | null }).description ?? null,
    avatarUrl: row.avatar_url,
    coverUrl: (row as { cover_url?: string | null }).cover_url ?? null,
    instagramUrl: (row as { instagram_url?: string | null }).instagram_url ?? null,
    youtubeUrl: (row as { youtube_url?: string | null }).youtube_url ?? null,
    xUrl: (row as { x_url?: string | null }).x_url ?? null,
    facebookUrl: (row as { facebook_url?: string | null }).facebook_url ?? null,
    linkedinUrl: (row as { linkedin_url?: string | null }).linkedin_url ?? null,
    upiId: row.upi_id,
    upiQrUrl: row.upi_qr_url,
    verified: row.verified,
  };
}

function toTier(row: TicketTierRow): TicketTier {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    pricePaise: row.price_paise,
    quantity: row.quantity,
    quantitySold: row.quantity_sold,
    perks: row.perks ?? [],
    sortOrder: row.sort_order,
    tierType: ((row as { tier_type?: string }).tier_type as TierType) ?? "NAMED",
    phaseOrder: (row as { phase_order?: number | null }).phase_order ?? null,
    phaseOpensAt: (row as { phase_opens_at?: string | null }).phase_opens_at ?? null,
    phaseClosesAt: (row as { phase_closes_at?: string | null }).phase_closes_at ?? null,
  };
}

function minPrice(tiers: TicketTier[]): number {
  return tiers.length === 0 ? 0 : Math.min(...tiers.map((tier) => tier.pricePaise));
}

function toSummary(row: EventRow, tiers: TicketTier[]): EventSummary {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    city: row.city,
    venueName: row.venue_name,
    startsAt: row.starts_at,
    cardPosterUrl: row.card_poster_url,
    bannerPosterUrl: row.banner_poster_url,
    minPricePaise: minPrice(tiers),
    isFeatured: row.is_featured,
    registrationsCount: row.registrations_count,
    tags: row.tags ?? [],
    status: row.status,
    pricingMode: (row.pricing_mode ?? "PAID") as PricingMode,
  };
}

function toDetail(
  row: EventRow,
  organizer: Organizer,
  tiers: TicketTier[],
): EventDetail {
  return {
    ...toSummary(row, tiers),
    description: row.description,
    thingsToKnow: row.things_to_know ?? [],
    venueAddress: row.venue_address,
    latitude: row.latitude,
    longitude: row.longitude,
    googleMapsLink: row.google_maps_link ?? null,
    endsAt: row.ends_at,
    feePayer: row.fee_payer,
    status: row.status,
    needsDoorStaff: row.needs_door_staff,
    terms: row.terms ?? [],
    organizer,
    tiers: tiers.sort((a, b) => a.sortOrder - b.sortOrder),
    photoUrls: row.photo_urls ?? [],
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    instagramUrl: (row as { instagram_url?: string | null }).instagram_url ?? null,
    youtubeUrl: (row as { youtube_url?: string | null }).youtube_url ?? null,
    xUrl: (row as { x_url?: string | null }).x_url ?? null,
    facebookUrl: (row as { facebook_url?: string | null }).facebook_url ?? null,
    linkedinUrl: (row as { linkedin_url?: string | null }).linkedin_url ?? null,
  };
}

export async function listEvents(query: EventQuery = {}): Promise<EventSummary[]> {
  const search = query.search?.trim().toLowerCase();

  const supabase = await createClient();
  let request = supabase
    .from("events")
    .select("*")
    .in("status", ["PUBLISHED", "POSTPONED"])
    .order("starts_at", { ascending: true });

  if (query.city) request = request.eq("city", query.city);
  // Use text cast to avoid 22P02 enum errors while DB migrations are in flight
  if (query.category) request = (request as ReturnType<typeof request.eq>).filter("category::text", "eq", query.category);
  if (search) {
    request = request.or(`title.ilike.%${search}%,venue_name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data: events, error } = await request;
  if (error) {
    console.error("[listEvents] Supabase error:", JSON.stringify(error));
    // 22P02 = invalid input value for enum — DB enum out of sync; return empty
    if ((error as { code?: string }).code === "22P02") return [];
    throw error;
  }
  if (!events || events.length === 0) return [];

  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("*")
    .in(
      "event_id",
      events.map((event) => event.id),
    );

  return events.map((event) =>
    toSummary(
      event,
      (tiers ?? []).filter((tier) => tier.event_id === event.id).map(toTier),
    ),
  );
}

export async function listFeaturedEvents(city?: City): Promise<EventSummary[]> {
  const events = await listEvents({ city });
  return events.filter((event) => event.isFeatured).slice(0, MAX_FEATURED_EVENTS);
}

export async function getEvent(id: string): Promise<EventDetail | null> {
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!event) return null;

  const [{ data: organizer }, { data: tiers }] = await Promise.all([
    supabase.from("organizers").select("*").eq("id", event.organizer_id).maybeSingle(),
    supabase
      .from("ticket_tiers")
      .select("*")
      .eq("event_id", event.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (!organizer) return null;

  return toDetail(event, toOrganizer(organizer), (tiers ?? []).map(toTier));
}
