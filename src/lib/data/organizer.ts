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
  PricingMode,
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
      pricingMode: event.pricingMode ?? "PAID",
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
      pricingMode: (event.pricing_mode ?? "PAID") as PricingMode,
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
      photoUrls: input.photoUrls ?? [],
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      description: input.description,
      thingsToKnow: input.thingsToKnow,
      latitude: input.latitude,
      longitude: input.longitude,
      googleMapsLink: input.googleMapsLink,
      feePayer: input.feePayer,
      status: "PUBLISHED",
      needsDoorStaff: input.needsDoorStaff,
      terms,
      pricingMode: input.pricingMode,
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

  // Get all confirmed orders for this event
  const { listEventOrders } = await import("@/lib/data/admin");
  const orders = (await listEventOrders(eventId)).filter(
    (o) => o.status === "CONFIRMED",
  );

  let totalRefundPaise = 0;
  let totalPlatformFeePaise = 0;

  if (!isSupabaseConfigured()) {
    // Demo mode: just update status + tickets
    const store = (await import("@/lib/data/demo-store")).demoStore();
    const event = store.events.find((e) => e.id === eventId);
    if (event) event.status = "CANCELLED";

    for (const order of orders) {
      order.status = "REFUNDED";
      totalRefundPaise += order.totalPaise;
      totalPlatformFeePaise += order.platformFeePaise;
    }
    // Cancel tickets
    store.tickets = store.tickets.map((t) =>
      t.eventId === eventId ? { ...t, status: "CANCELLED" as const } : t,
    );
  } else {
    const supabase = await createClient();

    // 1. Set status → CANCELLATION_REQUESTED first, then CANCELLED
    await supabase
      .from("events")
      .update({ status: "CANCELLATION_REQUESTED" })
      .eq("id", eventId)
      .eq("organizer_id", organizer.id);

    // 2. Mark all confirmed orders as REFUNDED
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      await supabase
        .from("orders")
        .update({ status: "REFUNDED" })
        .in("id", orderIds);

      // 3. Mark all tickets as CANCELLED
      await supabase
        .from("tickets")
        .update({ status: "CANCELLED" })
        .in("order_id", orderIds);

      // 4. Create refund records
      const refundRecords = orders.map((order) => ({
        order_id: order.id,
        event_id: eventId,
        user_id: order.userId ?? "",
        amount_paise: order.totalPaise,
        platform_fee_paise: order.platformFeePaise,
        status: "PENDING" as const,
        reason,
        initiated_at: new Date().toISOString(),
      }));

      // Filter out orders without a user_id (shouldn't happen but safety)
      const validRefunds = refundRecords.filter((r) => r.user_id);
      if (validRefunds.length > 0) {
        await supabase.from("refunds").insert(validRefunds);
      }

      // 5. Create notifications for all affected users
      const userIds = [...new Set(orders.map((o) => o.userId).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const notifications = userIds.map((userId) => ({
          event_id: eventId,
          user_id: userId,
          type: "CANCELLATION" as const,
          message: reason || "The event has been cancelled. You will receive a full refund.",
        }));
        await supabase.from("event_notifications").insert(notifications);
      }

      // Calculate totals
      for (const order of orders) {
        totalRefundPaise += order.totalPaise;
        totalPlatformFeePaise += order.platformFeePaise;
      }
    }

    // 6. Set final status → CANCELLED
    await supabase
      .from("events")
      .update({ status: "CANCELLED" })
      .eq("id", eventId)
      .eq("organizer_id", organizer.id);
  }

  // Cancellation charge: X% of total tickets sold (configurable from platform settings)
  const cancellationChargePaise = Math.round((totalRefundPaise * cancellationChargePercent) / 100);

  // Organizer owes: refund all buyers + platform fee + cancellation charge
  const organizerOwesPaise = totalRefundPaise + totalPlatformFeePaise + cancellationChargePaise;

  return {
    refundCount: orders.length,
    totalRefundPaise,
    totalPlatformFeePaise,
    cancellationChargePaise,
    cancellationChargePercent,
    organizerOwesPaise,
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

  const { listEventOrders } = await import("@/lib/data/admin");
  const orders = (await listEventOrders(eventId)).filter(
    (o) => o.status === "CONFIRMED",
  );

  if (!isSupabaseConfigured()) {
    const store = (await import("@/lib/data/demo-store")).demoStore();
    const event = store.events.find((e) => e.id === eventId);
    if (event) {
      event.status = "POSTPONED";
      event.startsAt = newStartsAt;
      event.endsAt = newEndsAt;
    }
  } else {
    const supabase = await createClient();

    // 1. Update event status + dates
    const { error } = await supabase
      .from("events")
      .update({
        status: "POSTPONED",
        starts_at: newStartsAt,
        ends_at: newEndsAt,
      })
      .eq("id", eventId)
      .eq("organizer_id", organizer.id);
    if (error) throw error;

    // 2. Notify all ticket holders
    if (orders.length > 0) {
      const userIds = [...new Set(orders.map((o) => o.userId).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const notifications = userIds.map((userId) => ({
          event_id: eventId,
          user_id: userId,
          type: "POSTPONEMENT" as const,
          message: reason || `Event has been postponed to ${new Date(newStartsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. You can keep your ticket or request a refund.`,
        }));
        await supabase.from("event_notifications").insert(notifications);
      }
    }
  }

  // Platform fee for tickets that will be refunded (charged to organizer)
  let totalPlatformFeePaise = 0;
  let totalRefundablePaise = 0;
  for (const order of orders) {
    totalPlatformFeePaise += order.platformFeePaise;
    totalRefundablePaise += order.totalPaise;
  }

  // Postponement charge: X% of refunded tickets (if all refund, this is the max)
  const potentialPostponementChargePaise = Math.round(
    (totalRefundablePaise * postponementChargePercent) / 100,
  );

  return {
    notifiedCount: orders.length,
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
}

export async function updateEvent(
  user: CurrentUser,
  eventId: string,
  input: UpdateEventInput,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const store = (await import("@/lib/data/demo-store")).demoStore();
    const event = store.events.find((e) => e.id === eventId);
    if (event) {
      event.title = input.title;
      event.description = input.description;
      event.venueName = input.venueName;
      event.venueAddress = input.venueAddress;
      event.latitude = input.latitude;
      event.longitude = input.longitude;
      event.googleMapsLink = input.googleMapsLink;
      event.startsAt = input.startsAt;
      event.endsAt = input.endsAt;
      event.tags = input.tags;
      if (input.photoUrls) event.photoUrls = input.photoUrls;
      if (input.contactEmail !== undefined) event.contactEmail = input.contactEmail;
      if (input.contactPhone !== undefined) event.contactPhone = input.contactPhone;
      if (input.tiers) {
        event.tiers = input.tiers.map((t, i) => ({
          id: t.id ?? `tier-${Date.now()}-${i}`,
          eventId,
          name: t.name,
          pricePaise: t.pricePaise,
          quantity: t.quantity,
          quantitySold: event.tiers.find((et) => et.id === t.id)?.quantitySold ?? 0,
          perks: t.perks,
          sortOrder: i,
        }));
      }
    }
    return;
  }

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
    })
    .eq("id", eventId)
    .eq("organizer_id", organizer.id);
  if (error) throw error;

  // Update tiers if provided
  if (input.tiers) {
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
  if (!isSupabaseConfigured()) {
    const store = (await import("@/lib/data/demo-store")).demoStore();
    store.events = store.events.filter((e) => e.id !== eventId);
    return;
  }

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
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data, error } = await supabase
    .from("organizers")
    .insert({
      owner_id: user.id,
      name: input.name,
      bio: input.bio || null,
      upi_id: input.upiId || null,
      avatar_url: input.avatarUrl,
    } as any)
    .select("id")
    .single();

  // Update KYC fields separately so the Supabase generated types don't need updating
  if (data?.id) {
    await (supabase.from("organizers") as any).update({
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
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (error) throw error;

  // Flip the is_organizer flag on the profile row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("profiles").update({ is_organizer: true } as any).eq("id", user.id);

  return data.id;
}

export interface UpdateOrganizerInput {
  name: string;
  bio: string;
  upiId: string;
  avatarUrl: string | null;
}

/** Updates an organizer's profile (name, bio, UPI ID, avatar). */
export async function updateOrganizerProfile(
  user: CurrentUser,
  input: UpdateOrganizerInput,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    // Demo mode: update the in-memory organizer
    const org = DEMO_ORGANIZERS.basement;
    org.name = input.name;
    org.bio = input.bio || null;
    org.upiId = input.upiId || null;
    org.avatarUrl = input.avatarUrl ?? org.avatarUrl;
    return;
  }

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
    })
    .eq("id", organizer.id);

  if (error) throw error;
}
