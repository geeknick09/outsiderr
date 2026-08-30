import "server-only";

import { DEMO_ORGANIZERS } from "@/lib/data/demo-data";
import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Organizer, EventSummary } from "@/lib/types";

export async function getPublicOrganizer(id: string): Promise<Organizer | null> {
  if (!isSupabaseConfigured()) {
    return Object.values(DEMO_ORGANIZERS).find((org) => org.id === id) ?? null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizers")
    .select("id, name, bio, avatar_url, upi_id, upi_qr_url, verified")
    .eq("id", id)
    .single();

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

export async function listPublicOrganizerEvents(
  organizerId: string,
): Promise<EventSummary[]> {
  if (!isSupabaseConfigured()) {
    return demoStore()
      .events.filter((ev) => ev.organizer.id === organizerId)
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        category: ev.category,
        city: ev.city,
        venueName: ev.venueName,
        startsAt: ev.startsAt,
        cardPosterUrl: ev.cardPosterUrl,
        bannerPosterUrl: ev.bannerPosterUrl,
        minPricePaise: ev.tiers.length ? Math.min(...ev.tiers.map((t) => t.pricePaise)) : 0,
        isFeatured: ev.isFeatured,
        registrationsCount: ev.registrationsCount,
        tags: ev.tags ?? [],
      }));
  }

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizerId)
    .eq("status", "PUBLISHED")
    .order("starts_at", { ascending: false });

  if (!events || events.length === 0) return [];

  const eventIds = events.map((e) => e.id);
  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("event_id, price_paise")
    .in("event_id", eventIds);

  const tiersByEvent: Record<string, number[]> = {};
  for (const t of tiers ?? []) {
    tiersByEvent[t.event_id] = [...(tiersByEvent[t.event_id] ?? []), t.price_paise];
  }

  return events.map((event) => {
    const prices = tiersByEvent[event.id] ?? [];
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
    };
  });
}
