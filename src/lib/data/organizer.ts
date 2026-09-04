import "server-only";

import { DEFAULT_EVENT_TERMS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type {
  City,
  EventCategory,
  EventSummary,
  FeePayer,
  Organizer,
  PricingMode,
} from "@/lib/types";

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
  feePayer: FeePayer;
  needsDoorStaff: boolean;
  terms: string[];
  pricingMode: PricingMode;
  tiers: TicketTierInput[];
  photoUrls: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  instagramUrl: string | null;
}

export async function getOrganizerProfile(
  user: CurrentUser,
): Promise<Organizer | null> {
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
    coverUrl: (data as { cover_url?: string | null }).cover_url ?? null,
    instagramUrl: (data as { instagram_url?: string | null }).instagram_url ?? null,
    upiId: data.upi_id,
    upiQrUrl: data.upi_qr_url,
    verified: data.verified,
  };
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
      pricingMode: (event.pricing_mode ?? "PAID") as PricingMode,
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
      fee_payer: input.feePayer,
      needs_door_staff: input.needsDoorStaff,
      terms,
      tags: input.tags ?? [],
      photo_urls: input.photoUrls ?? [],
      contact_email: input.contactEmail ?? null,
      contact_phone: input.contactPhone ?? null,
      instagram_url: input.instagramUrl ?? null,
      pricing_mode: input.pricingMode,
      status: "PUBLISHED",
    })
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

export async function getOrganizerEventAnalytics(
  user: CurrentUser,
  eventId: string,
): Promise<import("@/lib/types").EventAnalytics | null> {
  const { getEventAnalytics } = await import("@/lib/data/admin");
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
  const { getCancellationChargePercent } = await import("@/lib/data/platform-settings");
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
  const { getPostponementChargePercent } = await import("@/lib/data/platform-settings");
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
  const { listEventOrders } = await import("@/lib/data/admin");
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
  tiers?: { id?: string; name: string; pricePaise: number; quantity: number; perks: string[] }[];
  photoUrls?: string[];
  contactEmail?: string | null;
  contactPhone?: string | null;
  instagramUrl?: string | null;
}

export async function updateEvent(
  user: CurrentUser,
  eventId: string,
  input: UpdateEventInput,
): Promise<void> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile.");

  const supabase = await createClient();
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
      ...(input.photoUrls !== undefined ? { photo_urls: input.photoUrls } : {}),
      ...(input.contactEmail !== undefined ? { contact_email: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contact_phone: input.contactPhone } : {}),
      ...(input.instagramUrl !== undefined ? { instagram_url: input.instagramUrl } : {}),
    })
    .eq("id", eventId)
    .eq("organizer_id", organizer.id);
  if (error) throw error;

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
          })
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
          });
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

export interface CreateOrganizerInput {
  name: string;
  bio: string;
  upiId: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  instagramUrl: string | null;
  panNumber: string;
  panName: string;
  gstNumber: string;
  gstBusinessName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountName: string;
  bankAccountType: string;
  agreedToTerms: boolean;
}

/**
 * Creates an organizer profile for the current user.
 * Returns the new organizer's id.
 */
export async function createOrganizerProfile(
  user: CurrentUser,
  input: CreateOrganizerInput,
): Promise<string> {
  // If the user already has a profile, return its id.
  const existing = await getOrganizerProfile(user);
  if (existing) return existing.id;

  const supabase = await createClient();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data, error } = await supabase
    .from("organizers")
    .insert({
      owner_id: user.id,
      name: input.name,
      bio: input.bio || null,
      upi_id: input.upiId || null,
      avatar_url: input.avatarUrl,
      cover_url: input.coverUrl,
      instagram_url: input.instagramUrl,
    } as any)
    .select("id")
    .single();

  // Check insert error IMMEDIATELY — don't proceed to KYC update if insert failed
  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create organizer profile — no ID returned.");

  // Update KYC fields separately so the Supabase generated types don't need updating
  const { error: kycError } = await (supabase.from("organizers") as any).update({
    pan_number: input.panNumber || null,
    pan_name: input.panName || null,
    gst_number: input.gstNumber || null,
    gst_business_name: input.gstBusinessName || null,
    bank_account_number: input.bankAccountNumber || null,
    bank_ifsc: input.bankIfsc || null,
    bank_account_name: input.bankAccountName || null,
    bank_account_type: input.bankAccountType || null,
    kyc_submitted: !!(input.panNumber && input.bankAccountNumber),
  }).eq("id", data.id);
  if (kycError) {
    console.error("KYC update failed:", kycError);
    throw new Error(`Organizer created but KYC update failed: ${kycError.message}`);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Flip the is_organizer flag on the profile row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: profileError } = await supabase.from("profiles").update({ is_organizer: true } as any).eq("id", user.id);
  if (profileError) {
    console.error("Failed to set is_organizer flag:", profileError);
    // Non-fatal — organizer profile is created, flag can be set later
  }

  return data.id;
}

export interface UpdateOrganizerInput {
  name: string;
  bio: string;
  upiId: string;
  avatarUrl: string | null;
  coverUrl?: string | null;
  instagramUrl?: string | null;
}

/** Updates an organizer's profile (name, bio, UPI ID, avatar, cover). */
export async function updateOrganizerProfile(
  user: CurrentUser,
  input: UpdateOrganizerInput,
): Promise<void> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile found.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizers")
    .update({
      name: input.name,
      bio: input.bio || null,
      upi_id: input.upiId || null,
      avatar_url: input.avatarUrl,
      ...(input.coverUrl !== undefined ? { cover_url: input.coverUrl } : {}),
      ...(input.instagramUrl !== undefined ? { instagram_url: input.instagramUrl } : {}),
    })
    .eq("id", organizer.id);

  if (error) throw error;
}
