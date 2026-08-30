import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_EVENT_TERMS } from "@/lib/constants";
import { DEMO_ORGANIZERS } from "@/lib/data/demo-data";
import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { DEMO_ORGANIZER_COOKIE } from "@/lib/auth";
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
  tags: string[];
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
  if (!isSupabaseConfigured()) {
    // Demo mode: only return the demo organizer if the user has "become" one.
    const hasOrg = (await cookies()).get(DEMO_ORGANIZER_COOKIE)?.value;
    if (!hasOrg) return null;
    return DEMO_ORGANIZERS.basement;
  }

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
      tags: event.tags ?? [],
      status: event.status,
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
      tags: event.tags ?? [],
      status: event.status as import("@/lib/types").EventStatus,
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
      tags: input.tags ?? [],
      photoUrls: [],
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
      tags: input.tags ?? [],
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

export async function getOrganizerEventAnalytics(
  user: CurrentUser,
  eventId: string,
): Promise<import("@/lib/types").EventAnalytics | null> {
  const { getEventAnalytics } = await import("@/lib/data/admin");
  if (!isSupabaseConfigured()) return getEventAnalytics(eventId);
  // Verify the event belongs to this organizer
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", organizer.id)
    .maybeSingle();
  if (!data) return null;
  return getEventAnalytics(eventId);
}

export async function updateEventStatus(
  user: CurrentUser,
  eventId: string,
  status: import("@/lib/types").EventStatus,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const event = (await import("@/lib/data/demo-store")).demoStore().events.find((e) => e.id === eventId);
    if (event) event.status = status;
    return;
  }
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ status })
    .eq("id", eventId)
    .eq("organizer_id", organizer.id);
  if (error) throw error;
}

export interface CreateOrganizerInput {
  name: string;
  bio: string;
  upiId: string;
  avatarUrl: string | null;
}

/**
 * Creates an organizer profile for the current user.
 * In demo mode this is a no-op — every signed-in user is already an organizer.
 * Returns the new organizer's id.
 */
export async function createOrganizerProfile(
  user: CurrentUser,
  input: CreateOrganizerInput,
): Promise<string> {
  if (!isSupabaseConfigured()) {
    // Demo mode: set a cookie marking this user as an organizer.
    (await cookies()).set(DEMO_ORGANIZER_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return DEMO_ORGANIZERS.basement.id;
  }

  // If the user already has a profile, return its id.
  const existing = await getOrganizerProfile(user);
  if (existing) return existing.id;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizers")
    .insert({
      owner_id: user.id,
      name: input.name,
      bio: input.bio || null,
      upi_id: input.upiId || null,
      avatar_url: input.avatarUrl,
      verified: false,
    })
    .select("id")
    .single();

  if (error) throw error;

  // Flip the is_organizer flag on the profile row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("profiles").update({ is_organizer: true } as any).eq("id", user.id);

  return data.id;
}
