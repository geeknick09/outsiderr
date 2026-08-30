import "server-only";

import { MAX_FEATURED_EVENTS } from "@/lib/constants";
import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
  TicketTier,
} from "@/lib/types";

export interface EventQuery {
  city?: City;
  category?: EventCategory;
}

function toOrganizer(row: OrganizerRow): Organizer {
  return {
    id: row.id,
    name: row.name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
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
    endsAt: row.ends_at,
    feePayer: row.fee_payer,
    status: row.status,
    needsDoorStaff: row.needs_door_staff,
    terms: row.terms ?? [],
    organizer,
    tiers: tiers.sort((a, b) => a.sortOrder - b.sortOrder),
    photoUrls: row.photo_urls ?? [],
  };
}

function summarise(event: EventDetail): EventSummary {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    city: event.city,
    venueName: event.venueName,
    startsAt: event.startsAt,
    cardPosterUrl: event.cardPosterUrl,
    bannerPosterUrl: event.bannerPosterUrl,
    minPricePaise: minPrice(event.tiers),
    isFeatured: event.isFeatured,
    registrationsCount: event.registrationsCount,
    tags: event.tags ?? [],
  };
}

export async function listEvents(query: EventQuery = {}): Promise<EventSummary[]> {
  if (!isSupabaseConfigured()) {
    return demoStore()
      .events.filter(
        (event) =>
          event.status === "PUBLISHED" &&
          (!query.city || event.city === query.city) &&
          (!query.category || event.category === query.category),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(summarise);
  }

  const supabase = await createClient();
  let request = supabase
    .from("events")
    .select("*")
    .eq("status", "PUBLISHED")
    .order("starts_at", { ascending: true });

  if (query.city) request = request.eq("city", query.city);
  if (query.category) request = request.eq("category", query.category);

  const { data: events, error } = await request;
  if (error) throw error;
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
  if (!isSupabaseConfigured()) {
    return demoStore().events.find((event) => event.id === id) ?? null;
  }

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
