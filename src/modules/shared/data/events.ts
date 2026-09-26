import "server-only";

import { MAX_FEATURED_EVENTS } from "../lib/constants";
import { STORAGE_BUCKET } from "../auth/config";
import { createClient } from "../auth/server";
import { createServiceClient } from "../auth/service";
import { sanitizeSearchTerm } from "./organizers";
import type {
  EventRow,
  OrganizerRow,
  TicketTierRow,
} from "../db/database.types";
import type {
  City,
  EventCategory,
  EventDetail,
  EventSummary,
  Organizer,
  PricingMode,
  TicketTier,
  TierType,
} from "../lib/types";

export interface EventQuery {
  city?: City;
  category?: EventCategory;
  search?: string;
}

// Accepts either the full organizers row or the sanitized organizers_public
// view row — toOrganizer only reads the shared (safe) columns.
type PublicOrganizerRow = Pick<
  OrganizerRow,
  | "id" | "owner_id" | "name" | "bio" | "description" | "avatar_url"
  | "cover_url" | "instagram_url" | "youtube_url" | "x_url" | "facebook_url"
  | "linkedin_url" | "upi_id" | "upi_qr_url" | "verified" | "created_at"
>;

function toOrganizer(row: PublicOrganizerRow): Organizer {
  return {
    id: row.id,
    ownerId: (row as { owner_id?: string }).owner_id ?? "",
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
    quantityReserved: (row as { quantity_reserved?: number }).quantity_reserved ?? 0,
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
  const categoriesRaw = (row as { categories?: string[] }).categories ?? [];
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    categories: categoriesRaw.length > 0 ? categoriesRaw as EventCategory[] : [row.category],
    city: row.city,
    venueName: row.venue_name,
    startsAt: row.starts_at,
    cardPosterUrl: row.card_poster_url,
    bannerPosterUrl: row.banner_poster_url,
    teaserVideoUrl: row.teaser_video_url,
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
    commissionBps: (row as { commission_bps?: number }).commission_bps ?? 1000,
    commissionEnabled: (row as { commission_enabled?: boolean }).commission_enabled ?? true,
    convenienceFeeBps: (row as { convenience_fee_bps?: number }).convenience_fee_bps ?? 200,
    convenienceFeeEnabled: (row as { convenience_fee_enabled?: boolean }).convenience_fee_enabled ?? true,
    status: row.status,
    needsDoorStaff: row.needs_door_staff,
    waitlistEnabled: (row as { waitlist_enabled?: boolean }).waitlist_enabled ?? true,
    allowBookingDuringEvent: (row as { allow_booking_during_event?: boolean }).allow_booking_during_event ?? false,
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
    linkedPastEventIds: (row as { linked_past_event_ids?: string[] }).linked_past_event_ids ?? [],
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
  // Filter by categories array (contains) — supports multi-category events
  if (query.category) request = request.contains("categories", [query.category]);
  if (search) {
    // Strip PostgREST .or() metacharacters (,%()_.") and wildcards — a bare
    // '%)' or 'x,y' in the input would otherwise corrupt the filter → error.
    const safe = sanitizeSearchTerm(search);
    if (safe) {
      // Organizer names live on a related table — resolve matching organizer
      // ids first, then include them in the OR filter.
      const { data: orgRows } = await supabase
        .from("organizers_public")
        .select("id")
        .ilike("name", `%${safe}%`)
        .limit(50);
      const orgIds = (orgRows ?? []).map((o) => o.id);
      const filters = [
        `title.ilike.%${safe}%`,
        `venue_name.ilike.%${safe}%`,
        `description.ilike.%${safe}%`,
      ];
      if (orgIds.length > 0) {
        filters.push(`organizer_id.in.(${orgIds.join(",")})`);
      }
      request = request.or(filters.join(","));
    }
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
    // Public read path → sanitized view (base organizers table is owner/admin only)
    supabase.from("organizers_public").select("*").eq("id", event.organizer_id).maybeSingle(),
    supabase
      .from("ticket_tiers")
      .select("*")
      .eq("event_id", event.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (!organizer) return null;

  return toDetail(event, toOrganizer(organizer), (tiers ?? []).map(toTier));
}

/**
 * Get an organizer's past events (completed, not cancelled) for linking as previous editions.
 * Returns minimal info: id, title, startsAt. Only for the event form's multi-select.
 */
export async function getOrganizerPastEventsForLinking(
  organizerId: string,
  excludeEventId?: string,
): Promise<Array<{ id: string; title: string; startsAt: string }>> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  let query = supabase
    .from("events")
    .select("id, title, starts_at")
    .eq("organizer_id", organizerId)
    .lt("starts_at", now)
    .neq("status", "CANCELLED")
    .order("starts_at", { ascending: false });

  if (excludeEventId) {
    query = query.neq("id", excludeEventId);
  }

  const { data: events } = await query;
  if (!events) return [];

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
  }));
}

/**
 * Get details for linked past events (for display on the event page).
 * Returns: id, title, startsAt, cardPosterUrl, and aggregate rating.
 */
export async function getLinkedPastEvents(
  eventIds: string[],
): Promise<Array<{ id: string; title: string; startsAt: string; cardPosterUrl: string | null; rating: number; reviewCount: number }>> {
  if (!eventIds.length) return [];

  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("id, title, starts_at, card_poster_url")
    .in("id", eventIds)
    .order("starts_at", { ascending: false });

  if (!events || events.length === 0) return [];

  // Get reviews for these events
  const { data: reviews } = await supabase
    .from("event_reviews")
    .select("event_id, rating")
    .in("event_id", eventIds);

  const ratingByEvent: Record<string, { sum: number; count: number }> = {};
  for (const r of reviews ?? []) {
    const eid = (r as { event_id: string }).event_id;
    if (!ratingByEvent[eid]) ratingByEvent[eid] = { sum: 0, count: 0 };
    ratingByEvent[eid].sum += (r as { rating: number }).rating;
    ratingByEvent[eid].count++;
  }

  // Preserve the order of eventIds (which is the order the organizer chose)
  return eventIds
    .map((id) => {
      const event = events.find((e) => e.id === id);
      if (!event) return null;
      const ratingInfo = ratingByEvent[id];
      return {
        id: event.id,
        title: event.title,
        startsAt: event.starts_at,
        cardPosterUrl: (event as { card_poster_url?: string | null }).card_poster_url ?? null,
        rating: ratingInfo && ratingInfo.count > 0 ? Math.round((ratingInfo.sum / ratingInfo.count) * 10) / 10 : 0,
        reviewCount: ratingInfo?.count ?? 0,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

/**
 * Delete teaser videos for events that are over (or cancelled), freeing the
 * event-media bucket. Parses the storage path out of the public URL so pasted
 * external URLs only get the column cleared. Returns the number cleaned.
 */
export async function cleanupExpiredTeasers(): Promise<number> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: events, error } = await supabase
    .from("events")
    .select("id, teaser_video_url, status, starts_at, ends_at")
    .not("teaser_video_url", "is", null)
    .or(`status.eq.CANCELLED,ends_at.lt.${now},and(ends_at.is.null,starts_at.lt.${now})`);

  if (error || !events || events.length === 0) {
    if (error) console.error("[cleanup-teasers] fetch failed:", error.message);
    return 0;
  }

  const marker = `/object/public/${STORAGE_BUCKET}/`;
  let cleaned = 0;

  for (const event of events as { id: string; teaser_video_url: string | null }[]) {
    const url = event.teaser_video_url;
    if (url && url.includes(marker)) {
      const path = url.substring(url.indexOf(marker) + marker.length);
      const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
      if (rmErr) console.error(`[cleanup-teasers] remove ${path}:`, rmErr.message);
    }
    const { error: upErr } = await supabase
      .from("events")
      .update({ teaser_video_url: null })
      .eq("id", event.id);
    if (!upErr) cleaned++;
    else console.error(`[cleanup-teasers] clear ${event.id}:`, upErr.message);
  }

  return cleaned;
}

/**
 * Permanently delete draft events older than `draft_retention_days` (default
 * 60, admin-configurable) measured from created_at — organizers were warned at
 * save time. Removes the row (children cascade) AND every uploaded media file
 * (card/banner posters, teaser video, gallery photos) that lives in our bucket.
 */
export async function purgeOldDraftEvents(): Promise<{ purged: number; filesRemoved: number }> {
  const supabase = createServiceClient();

  const { data: setting } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "draft_retention_days")
    .maybeSingle();
  const parsed = Number(setting?.value);
  const days = Number.isFinite(parsed) && parsed >= 1 ? parsed : 60;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: drafts, error } = await supabase
    .from("events")
    .select("id, title, card_poster_url, banner_poster_url, teaser_video_url, photo_urls")
    .eq("status", "DRAFT")
    .lt("created_at", cutoff);

  if (error || !drafts || drafts.length === 0) {
    if (error) console.error("[purge-drafts] fetch failed:", error.message);
    return { purged: 0, filesRemoved: 0 };
  }

  // Collect every storage path referenced by the doomed rows
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const paths: string[] = [];
  for (const ev of drafts as {
    id: string;
    card_poster_url: string | null;
    banner_poster_url: string | null;
    teaser_video_url: string | null;
    photo_urls: string[] | null;
  }[]) {
    for (const url of [ev.card_poster_url, ev.banner_poster_url, ev.teaser_video_url, ...(ev.photo_urls ?? [])]) {
      if (url && url.includes(marker)) {
        paths.push(url.substring(url.indexOf(marker) + marker.length));
      }
    }
  }

  let filesRemoved = 0;
  if (paths.length > 0) {
    // Storage remove accepts up to 1000 paths per call — chunk defensively
    for (let i = 0; i < paths.length; i += 200) {
      const { error: rmErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(paths.slice(i, i + 200));
      if (rmErr) console.error("[purge-drafts] storage remove:", rmErr.message);
      else filesRemoved += Math.min(200, paths.length - i);
    }
  }

  const { error: delErr, count } = await supabase
    .from("events")
    .delete({ count: "exact" })
    .in("id", drafts.map((d) => d.id));

  if (delErr) {
    console.error("[purge-drafts] delete failed:", delErr.message);
    return { purged: 0, filesRemoved };
  }

  console.info(
    `[purge-drafts] removed ${count ?? drafts.length} drafts (> ${days}d) + ${filesRemoved} files`,
    drafts.map((d) => d.id),
  );
  return { purged: count ?? drafts.length, filesRemoved };
}
