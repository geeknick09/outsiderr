import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_EVENT_TERMS } from "@/lib/constants";
import { DEMO_ORGANIZERS } from "@/lib/data/demo-data";
import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type {
  City,
  EventCategory,
  EventDetail,
  EventSummary,
  FeePayer,
  Organizer,
} from "@/lib/types";

export interface TicketTierInput {
  name: string;
  pricePaise: number;
  quantity: number;
  perks: string[];
}

export interface CreateEventInput {
  title: string;
  description: string;
  thingsToKnow: string[];
  category: EventCategory;
  city: City;
  venueName: string;
  venueAddress: string;
  latitude: number | null;
  longitude: number | null;
  startsAt: string;
  endsAt: string | null;
  cardPosterUrl: string | null;
  bannerPosterUrl: string | null;
  feePayer: FeePayer;
  needsDoorStaff: boolean;
  terms: string[];
  tiers: TicketTierInput[];
}

export async function getOrganizerProfile(
  user: CurrentUser,
): Promise<Organizer | null> {
  if (!isSupabaseConfigured()) return DEMO_ORGANIZERS.basement;

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizers")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
    upiId: data.upi_id,
    upiQrUrl: data.upi_qr_url,
    verified: data.verified,
  };
}

export async function listOrganizerEvents(
  user: CurrentUser,
): Promise<EventSummary[]> {
  if (!isSupabaseConfigured()) {
    return demoStore().events.map((event) => ({
      id: event.id,
      title: event.title,
      category: event.category,
      city: event.city,
      venueName: event.venueName,
      startsAt: event.startsAt,
      cardPosterUrl: event.cardPosterUrl,
      bannerPosterUrl: event.bannerPosterUrl,
      minPricePaise: Math.min(...event.tiers.map((tier) => tier.pricePaise)),
      isFeatured: event.isFeatured,
      registrationsCount: event.registrationsCount,
    }));
  }

  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizer.id)
    .order("starts_at", { ascending: true });
  if (!events || events.length === 0) return [];

  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("event_id, price_paise")
    .in(
      "event_id",
      events.map((event) => event.id),
    );

  return events.map((event) => {
    const prices = (tiers ?? [])
      .filter((tier) => tier.event_id === event.id)
      .map((tier) => tier.price_paise);
    return {
      id: event.id,
      title: event.title,
      category: event.category,
      city: event.city,
      venueName: event.venue_name,
      startsAt: event.starts_at,
      cardPosterUrl: event.card_poster_url,
      bannerPosterUrl: event.banner_poster_url,
      minPricePaise: prices.length ? Math.min(...prices) : 0,
      isFeatured: event.is_featured,
      registrationsCount: event.registrations_count,
    };
  });
}

export async function createEvent(
  user: CurrentUser,
  input: CreateEventInput,
): Promise<string> {
  const terms = input.terms.length > 0 ? input.terms : DEFAULT_EVENT_TERMS;

  if (!isSupabaseConfigured()) {
    const id = `evt-${randomUUID()}`;
    const event: EventDetail = {
      id,
      title: input.title,
      category: input.category,
      city: input.city,
      venueName: input.venueName,
      venueAddress: input.venueAddress,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      cardPosterUrl: input.cardPosterUrl,
      bannerPosterUrl: input.bannerPosterUrl,
      minPricePaise: Math.min(...input.tiers.map((tier) => tier.pricePaise)),
      isFeatured: false,
      registrationsCount: 0,
      description: input.description,
      thingsToKnow: input.thingsToKnow,
      latitude: input.latitude,
      longitude: input.longitude,
      feePayer: input.feePayer,
      status: "PUBLISHED",
      needsDoorStaff: input.needsDoorStaff,
      terms,
      organizer: DEMO_ORGANIZERS.basement,
      tiers: input.tiers.map((tier, index) => ({
        id: `tier-${randomUUID()}`,
        eventId: id,
        name: tier.name,
        pricePaise: tier.pricePaise,
        quantity: tier.quantity,
        quantitySold: 0,
        perks: tier.perks,
        sortOrder: index,
      })),
    };
    demoStore().events.push(event);
    return id;
  }

  const organizer = await getOrganizerProfile(user);
  if (!organizer) {
    throw new Error("Create an organizer profile before publishing an event.");
  }

  const supabase = await createClient();
  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organizer_id: organizer.id,
      title: input.title,
      description: input.description,
      things_to_know: input.thingsToKnow,
      category: input.category,
      city: input.city,
      venue_name: input.venueName,
      venue_address: input.venueAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      card_poster_url: input.cardPosterUrl,
      banner_poster_url: input.bannerPosterUrl,
      fee_payer: input.feePayer,
      needs_door_staff: input.needsDoorStaff,
      terms,
      status: "PUBLISHED",
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: tierError } = await supabase.from("ticket_tiers").insert(
    input.tiers.map((tier, index) => ({
      event_id: event.id,
      name: tier.name,
      price_paise: tier.pricePaise,
      quantity: tier.quantity,
      perks: tier.perks,
      sort_order: index,
    })),
  );
  if (tierError) throw tierError;

  return event.id;
}
