import "server-only";

import { DEFAULT_EVENT_TERMS } from "../../shared";
import { getOrganizerProfile, createClient } from "../../shared/server";
import type { CurrentUser } from "../../shared";
import type { City, EventCategory, EventSummary, FeePayer, PricingMode } from "../../shared";

export interface TicketTierInput {
  name: string;
  pricePaise: number;
  quantity: number;
  perks: string[];
  tierType?: "NAMED" | "FLAT_PHASE";
  phaseOrder?: number | null;
  phaseOpensAt?: string | null;
  phaseClosesAt?: string | null;
}

export interface CreateEventInput {
  title: string;
  description: string;
  thingsToKnow: string[];
  tags: string[];
  category: EventCategory;
  categories?: EventCategory[];
  city: City;
  venueName: string;
  venueAddress: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsLink: string | null;
  startsAt: string;
  endsAt: string | null;
  cardPosterUrl: string | null;
  bannerPosterUrl: string | null;
  teaserVideoUrl: string | null;
  feePayer: FeePayer;
  needsDoorStaff: boolean;
  waitlistEnabled?: boolean;
  terms: string[];
  pricingMode: PricingMode;
  tiers: TicketTierInput[];
  photoUrls: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  linkedPastEventIds?: string[];
  status?: import("@/modules/shared").EventStatus;
}

export async function listOrganizerEvents(
  user: CurrentUser,
): Promise<EventSummary[]> {
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
    .select("event_id, price_paise, quantity, quantity_sold")
    .in(
      "event_id",
      events.map((event) => event.id),
    );

  return events.map((event) => {
    const eventTiers = (tiers ?? []).filter((tier) => tier.event_id === event.id);
    const prices = eventTiers.map((tier) => tier.price_paise);
    const totalCapacity = eventTiers.reduce((sum, t) => sum + (t.quantity ?? 0), 0);
    const ticketsSold = eventTiers.reduce((sum, t) => sum + (t.quantity_sold ?? 0), 0);
    return {
      id: event.id,
      title: event.title,
      category: event.category,
      categories: ((event as { categories?: string[] }).categories ?? [event.category]) as EventCategory[],
      city: event.city,
      venueName: event.venue_name,
      startsAt: event.starts_at,
      endsAt: (event as { ends_at?: string | null }).ends_at ?? null,
      cardPosterUrl: event.card_poster_url,
      bannerPosterUrl: event.banner_poster_url,
      teaserVideoUrl: (event as { teaser_video_url?: string | null }).teaser_video_url ?? null,
      minPricePaise: prices.length ? Math.min(...prices) : 0,
      isFeatured: event.is_featured,
      registrationsCount: event.registrations_count,
      tags: event.tags ?? [],
      status: event.status as import("@/modules/shared").EventStatus,
      pricingMode: (event.pricing_mode ?? "PAID") as PricingMode,
      totalCapacity,
      ticketsSold,
    };
  });
}

/**
 * List events the current user co-organizes (accepted collaborations only).
 * Returns EventSummary[] with an extra `collaboratorPermission` field.
 */

export async function listCollaboratedEvents(
  user: CurrentUser,
): Promise<(EventSummary & { collaboratorPermission: string })[]> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();

  // Get accepted collaborations for this organizer
  const { data: collabs } = await supabase
    .from("event_collaborators")
    .select("event_id, permission_level")
    .eq("organizer_id", organizer.id)
    .eq("status", "ACCEPTED");

  if (!collabs || collabs.length === 0) return [];

  const eventIds = collabs.map((c) => c.event_id);
  const permMap = new Map(collabs.map((c) => [c.event_id, c.permission_level]));

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .in("id", eventIds)
    .order("starts_at", { ascending: true });

  if (!events || events.length === 0) return [];

  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("event_id, price_paise, quantity, quantity_sold")
    .in("event_id", eventIds);

  return events.map((event) => {
    const eventTiers = (tiers ?? []).filter((tier) => tier.event_id === event.id);
    const prices = eventTiers.map((tier) => tier.price_paise);
    const totalCapacity = eventTiers.reduce((sum, t) => sum + (t.quantity ?? 0), 0);
    const ticketsSold = eventTiers.reduce((sum, t) => sum + (t.quantity_sold ?? 0), 0);
    return {
      id: event.id,
      title: event.title,
      category: event.category,
      categories: ((event as { categories?: string[] }).categories ?? [event.category]) as EventCategory[],
      city: event.city,
      venueName: event.venue_name,
      startsAt: event.starts_at,
      endsAt: (event as { ends_at?: string | null }).ends_at ?? null,
      cardPosterUrl: event.card_poster_url,
      bannerPosterUrl: event.banner_poster_url,
      teaserVideoUrl: (event as { teaser_video_url?: string | null }).teaser_video_url ?? null,
      minPricePaise: prices.length ? Math.min(...prices) : 0,
      isFeatured: event.is_featured,
      registrationsCount: event.registrations_count,
      tags: event.tags ?? [],
      status: event.status as import("@/modules/shared").EventStatus,
      pricingMode: (event.pricing_mode ?? "PAID") as PricingMode,
      totalCapacity,
      ticketsSold,
      collaboratorPermission: permMap.get(event.id) ?? "VIEW_ONLY",
    };
  });
}


export async function createEvent(
  user: CurrentUser,
  input: CreateEventInput,
): Promise<string> {
  const terms = input.terms.length > 0 ? input.terms : DEFAULT_EVENT_TERMS;

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
      categories: input.categories ?? [input.category],
      city: input.city,
      venue_name: input.venueName,
      venue_address: input.venueAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      google_maps_link: input.googleMapsLink,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      card_poster_url: input.cardPosterUrl,
      banner_poster_url: input.bannerPosterUrl,
      teaser_video_url: input.teaserVideoUrl,
      fee_payer: input.feePayer,
      needs_door_staff: input.needsDoorStaff,
      waitlist_enabled: input.waitlistEnabled ?? true,
      terms,
      tags: input.tags ?? [],
      photo_urls: input.photoUrls ?? [],
      contact_email: input.contactEmail ?? null,
      contact_phone: input.contactPhone ?? null,
      instagram_url: input.instagramUrl ?? null,
      youtube_url: input.youtubeUrl ?? null,
      x_url: input.xUrl ?? null,
      facebook_url: input.facebookUrl ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      linked_past_event_ids: input.linkedPastEventIds ?? [],
      pricing_mode: input.pricingMode,
      status: input.status ?? "PUBLISHED",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id")
    .single();
  if (error) {
    console.error("createEvent insert error:", error);
    throw new Error(`Database error: ${error.message} (code: ${error.code ?? "unknown"})`);
  }

  const { error: tierError } = await supabase.from("ticket_tiers").insert(
    input.tiers.map((tier, index) => ({
      event_id: event.id,
      name: tier.name,
      price_paise: tier.pricePaise,
      quantity: tier.quantity,
      perks: tier.perks,
      sort_order: index,
      tier_type: tier.tierType ?? "NAMED",
      phase_order: tier.phaseOrder ?? null,
      phase_opens_at: tier.phaseOpensAt ?? null,
      phase_closes_at: tier.phaseClosesAt ?? null,
    })),
  );
  if (tierError) {
    console.error("createEvent tier insert error:", tierError);
    throw new Error(`Database error (tiers): ${tierError.message} (code: ${tierError.code ?? "unknown"})`);
  }

  return event.id;
}


export async function updateEventStatus(
  user: CurrentUser,
  eventId: string,
  status: import("@/modules/shared").EventStatus,
): Promise<void> {
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

export interface CancelEventResult {
  refundCount: number;
  totalRefundPaise: number;
  totalPlatformFeePaise: number;
  cancellationChargePaise: number;
  cancellationChargePercent: number;
  organizerOwesPaise: number;
}

/**
 * Cancel an event:
 * 1. Set status → CANCELLATION_REQUESTED → CANCELLED
 * 2. Mark all confirmed tickets as CANCELLED
 * 3. Create refund records for all confirmed orders
 * 4. Create event notifications for all ticket holders
 * 5. Calculate organizer charges: platform fee is non-refundable to organizer
 *
 * For free events: no charges, just cancel tickets + notify.
 * For paid events: organizer must refund all ticket buyers AND pay the total platform fee.
 */

export async function cancelEvent(
  user: CurrentUser,
  eventId: string,
  reason: string,
): Promise<CancelEventResult> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile.");

  // Read configurable cancellation charge from platform settings
  const { getCancellationChargePercent } = await import("@/modules/shared/server");
  const cancellationChargePercent = await getCancellationChargePercent();

  // Use the atomic cancel_event RPC — all operations in one DB transaction
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_event", {
    p_event_id: eventId,
    p_reason: reason || "The event has been cancelled.",
    p_cancellation_charge_percent: cancellationChargePercent,
  });
  if (error) throw new Error(error.message);

  const row = data?.[0];
  if (!row) throw new Error("Cancel failed — no result returned.");

  return {
    refundCount: row.refund_count ?? 0,
    totalRefundPaise: row.total_refund_paise ?? 0,
    totalPlatformFeePaise: row.total_platform_fee_paise ?? 0,
    cancellationChargePaise: row.cancellation_charge_paise ?? 0,
    cancellationChargePercent,
    organizerOwesPaise: row.organizer_owes_paise ?? 0,
  };
}

export interface PostponeEventResult {
  notifiedCount: number;
  totalPlatformFeePaise: number;
  postponementChargePercent: number;
  potentialPostponementChargePaise: number;
}

/**
 * Postpone an event:
 * 1. Set status → POSTPONED
 * 2. Update starts_at + ends_at with new dates
 * 3. Notify all ticket holders — they can choose to keep their ticket or request a refund
 * 4. Platform fee for refunded tickets is charged to the organizer
 */

export async function postponeEvent(
  user: CurrentUser,
  eventId: string,
  newStartsAt: string,
  newEndsAt: string | null,
  reason: string,
): Promise<PostponeEventResult> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile.");

  // Read configurable postponement charge from platform settings
  const { getPostponementChargePercent } = await import("@/modules/shared/server");
  const postponementChargePercent = await getPostponementChargePercent();

  // Use the atomic postpone_event RPC — status update + notifications in one transaction
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("postpone_event", {
    p_event_id: eventId,
    p_new_starts_at: newStartsAt,
    p_new_ends_at: newEndsAt,
    p_reason: reason || `Event has been postponed to ${new Date(newStartsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. You can keep your ticket or request a refund.`,
  });
  if (error) throw new Error(error.message);

  const row = data?.[0];
  const notifiedCount = row?.notified_count ?? 0;

  // Get platform fee for potential refund calculation (display only)
  const { listEventOrders } = await import("@/modules/shared/server");
  const orders = (await listEventOrders(eventId)).filter(
    (o) => o.status === "CONFIRMED",
  );
  let totalPlatformFeePaise = 0;
  let totalRefundablePaise = 0;
  for (const order of orders) {
    totalPlatformFeePaise += order.platformFeePaise;
    totalRefundablePaise += order.totalPaise;
  }

  const potentialPostponementChargePaise = Math.round(
    (totalRefundablePaise * postponementChargePercent) / 100,
  );

  return {
    notifiedCount,
    totalPlatformFeePaise,
    postponementChargePercent,
    potentialPostponementChargePaise,
  };
}

export interface UpdateEventInput {
  title: string;
  description: string;
  venueName: string;
  venueAddress: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsLink: string | null;
  startsAt: string;
  endsAt: string | null;
  tags: string[];
  city?: City;
  category?: EventCategory;
  categories?: EventCategory[];
  tiers?: { id?: string; name: string; pricePaise: number; quantity: number; perks: string[]; phaseOpensAt?: string | null; phaseClosesAt?: string | null }[];
  photoUrls?: string[];
  contactEmail?: string | null;
  contactPhone?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  xUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
  waitlistEnabled?: boolean;
  allowBookingDuringEvent?: boolean;
  thingsToKnow?: string[];
  terms?: string[];
  cardPosterUrl?: string | null;
  bannerPosterUrl?: string | null;
  teaserVideoUrl?: string | null;
  linkedPastEventIds?: string[];
}


export async function updateEvent(
  user: CurrentUser,
  eventId: string,
  input: UpdateEventInput,
): Promise<void> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile.");

  const supabase = await createClient();

  // Fetch current event to detect changes for notifications
  const { data: currentEvent } = await supabase
    .from("events")
    .select("venue_name, city, starts_at, ends_at")
    .eq("id", eventId)
    .maybeSingle();

  // Server-side 2-hour edit lock — prevents forged requests from bypassing the UI
  if (currentEvent?.starts_at) {
    const startMs = new Date(currentEvent.starts_at).getTime();
    const nowMs = Date.now();
    if (startMs - nowMs <= 2 * 60 * 60 * 1000) {
      throw new Error("Editing is locked within 2 hours of the event start time. Please contact Outsiderr support.");
    }
  }

  const { error } = await supabase
    .from("events")
    .update({
      title: input.title,
      description: input.description,
      venue_name: input.venueName,
      venue_address: input.venueAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      google_maps_link: input.googleMapsLink,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      tags: input.tags,
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.categories !== undefined ? { categories: input.categories } : {}),
      ...(input.photoUrls !== undefined ? { photo_urls: input.photoUrls } : {}),
      ...(input.contactEmail !== undefined ? { contact_email: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contact_phone: input.contactPhone } : {}),
      ...(input.instagramUrl !== undefined ? { instagram_url: input.instagramUrl } : {}),
      ...(input.youtubeUrl !== undefined ? { youtube_url: input.youtubeUrl } : {}),
      ...(input.xUrl !== undefined ? { x_url: input.xUrl } : {}),
      ...(input.facebookUrl !== undefined ? { facebook_url: input.facebookUrl } : {}),
      ...(input.linkedinUrl !== undefined ? { linkedin_url: input.linkedinUrl } : {}),
      ...(input.waitlistEnabled !== undefined ? { waitlist_enabled: input.waitlistEnabled } : {}),
      ...(input.allowBookingDuringEvent !== undefined ? { allow_booking_during_event: input.allowBookingDuringEvent } : {}),
      ...(input.thingsToKnow !== undefined ? { things_to_know: input.thingsToKnow } : {}),
      ...(input.terms !== undefined ? { terms: input.terms } : {}),
      ...(input.cardPosterUrl !== undefined ? { card_poster_url: input.cardPosterUrl } : {}),
      ...(input.bannerPosterUrl !== undefined ? { banner_poster_url: input.bannerPosterUrl } : {}),
      ...(input.teaserVideoUrl !== undefined ? { teaser_video_url: input.teaserVideoUrl } : {}),
      ...(input.linkedPastEventIds !== undefined ? { linked_past_event_ids: input.linkedPastEventIds } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("id", eventId)
    .eq("organizer_id", organizer.id);
  if (error) throw error;

  // Send notifications to ticket holders if key details changed
  if (currentEvent) {
    const changes: { type: string; message: string }[] = [];

    if (currentEvent.venue_name !== input.venueName) {
      changes.push({
        type: "VENUE_CHANGE",
        message: `Venue changed from "${currentEvent.venue_name}" to "${input.venueName}".`,
      });
    }
    if (input.city && currentEvent.city !== input.city) {
      changes.push({
        type: "CITY_CHANGE",
        message: `City changed from ${currentEvent.city} to ${input.city}.`,
      });
    }
    // Compare timestamps, not raw strings — DB returns "2026-09-16 14:00:00+00:00"
    // but istToUTC returns "2026-09-16T14:00:00.000Z". Same time, different format.
    const oldStart = currentEvent.starts_at ? new Date(currentEvent.starts_at).getTime() : null;
    const newStart = input.startsAt ? new Date(input.startsAt).getTime() : null;
    if (oldStart !== null && newStart !== null && oldStart !== newStart) {
      changes.push({
        type: "TIME_CHANGE",
        message: `Event time has been updated. Please check the new schedule.`,
      });
    }

    if (changes.length > 0) {
      // Get all ticket holders for this event
      const { data: tickets } = await supabase
        .from("tickets")
        .select("user_id")
        .eq("event_id", eventId)
        .in("status", ["VALID", "USED"]);

      // Get all "Update Me" subscribers for this event
      const { data: subs } = await supabase
        .from("event_subscriptions")
        .select("user_id")
        .eq("event_id", eventId);

      const ticketHolderIds = (tickets ?? []).map((t) => t.user_id).filter(Boolean);
      const subscriberIds = (subs ?? []).map((s) => s.user_id).filter(Boolean);
      // Merge and deduplicate — ticket holders + subscribers both get notified
      const userIds = [...new Set([...ticketHolderIds, ...subscriberIds])];

      if (userIds.length > 0) {
        const { sendNotifications } = await import("@/modules/shared/server");
        await sendNotifications(
          userIds.flatMap((userId) =>
            changes.map((change) => ({
              eventId,
              userId,
              type: change.type,
              message: change.message,
            })),
          ),
          supabase,
        );
      }
    }
  }

  // Update tiers if provided
  if (input.tiers) {
    // Get existing tier IDs for this event
    const { data: existingTiers } = await supabase
      .from("ticket_tiers")
      .select("id")
      .eq("event_id", eventId);
    const existingIds = (existingTiers ?? []).map((t) => t.id);
    const keptIds = input.tiers.filter((t) => t.id).map((t) => t.id as string);
    const deletedIds = existingIds.filter((id) => !keptIds.includes(id));

    // Delete tiers that were removed from the form (only if no tickets sold)
    if (deletedIds.length > 0) {
      // Check if any of the deleted tiers have sold tickets
      const { data: soldTiers } = await supabase
        .from("ticket_tiers")
        .select("id, quantity_sold")
        .in("id", deletedIds)
        .gt("quantity_sold", 0);
      const safeToDelete = deletedIds.filter(
        (id) => !(soldTiers ?? []).some((t) => t.id === id),
      );
      if (safeToDelete.length > 0) {
        const { error: delError } = await supabase
          .from("ticket_tiers")
          .delete()
          .in("id", safeToDelete)
          .eq("event_id", eventId);
        if (delError) throw delError;
      }
    }

    // Update/insert tiers
    for (let i = 0; i < input.tiers.length; i++) {
      const tier = input.tiers[i];
      // Prevent negative quantity
      if (tier.quantity < 0) {
        throw new Error("Ticket quantity cannot be negative.");
      }
      // Prevent reducing below already-sold quantity (server-side enforcement)
      if (tier.id) {
        const { data: existingTier } = await supabase
          .from("ticket_tiers")
          .select("quantity_sold")
          .eq("id", tier.id)
          .single();
        if (existingTier && tier.quantity < existingTier.quantity_sold) {
          throw new Error(
            `Quantity for "${tier.name}" cannot be less than ${existingTier.quantity_sold} (already sold).`,
          );
        }
      }
      if (tier.id) {
        // Update existing tier — preserve quantity_sold
        const { error: tierError } = await supabase
          .from("ticket_tiers")
          .update({
            name: tier.name,
            price_paise: tier.pricePaise,
            quantity: tier.quantity,
            perks: tier.perks,
            sort_order: i,
            ...(tier.phaseOpensAt !== undefined ? { phase_opens_at: tier.phaseOpensAt } : {}),
            ...(tier.phaseClosesAt !== undefined ? { phase_closes_at: tier.phaseClosesAt } : {}),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
          .eq("id", tier.id)
          .eq("event_id", eventId);
        if (tierError) throw tierError;
      } else {
        // Insert new tier
        const { error: tierError } = await supabase
          .from("ticket_tiers")
          .insert({
            event_id: eventId,
            name: tier.name,
            price_paise: tier.pricePaise,
            quantity: tier.quantity,
            perks: tier.perks,
            sort_order: i,
            ...(tier.phaseOpensAt !== undefined ? { phase_opens_at: tier.phaseOpensAt } : {}),
            ...(tier.phaseClosesAt !== undefined ? { phase_closes_at: tier.phaseClosesAt } : {}),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        if (tierError) throw tierError;
      }
    }
  }
}


export async function deleteEvent(
  user: CurrentUser,
  eventId: string,
): Promise<void> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("organizer_id", organizer.id);
  if (error) throw error;
}
