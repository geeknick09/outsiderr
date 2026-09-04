import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Organizer, EventSummary, PricingMode } from "@/lib/types";

export async function getPublicOrganizer(id: string): Promise<Organizer | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizers")
    .select("id, name, bio, avatar_url, cover_url, instagram_url, upi_id, upi_qr_url, verified")
    .eq("id", id)
    .single();

  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
    coverUrl: (data as { cover_url?: string | null }).cover_url ?? null,
    instagramUrl: (data as { instagram_url?: string | null }).instagram_url ?? null,
    upiId: data.upi_id,
    upiQrUrl: data.upi_qr_url,
    verified: data.verified,
  };
}

export async function listPublicOrganizerEvents(
  organizerId: string,
): Promise<EventSummary[]> {
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
      pricingMode: (event.pricing_mode ?? "PAID") as PricingMode,
    };
  });
}
