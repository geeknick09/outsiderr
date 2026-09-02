import "server-only";

import { randomUUID } from "node:crypto";

import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type {
  HeroBoost,
  HeroBoostStatus,
  HeroBoostWithEvent,
  HeroEvent,
} from "@/lib/types";

function toBoost(row: {
  id: string;
  event_id: string;
  organizer_id: string;
  status: string;
  amount_paise: number;
  currency: string;
  utr_reference: string | null;
  started_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  created_at: string;
}): HeroBoost {
  return {
    id: row.id,
    eventId: row.event_id,
    organizerId: row.organizer_id,
    status: row.status as HeroBoostStatus,
    amountPaise: row.amount_paise,
    currency: row.currency,
    utrReference: row.utr_reference,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    cancelledAt: row.cancelled_at,
    expiredAt: row.expired_at,
    createdAt: row.created_at,
  };
}

/**
 * Compute the effective expiry for a hero boost.
 * expires_at = min(started_at + duration_days, event.starts_at)
 */
export function computeExpiry(
  startedAt: string,
  durationDays: number,
  eventStartsAt: string,
): string {
  const durationMs = durationDays * 24 * 60 * 60 * 1000;
  const fromDuration = new Date(startedAt).getTime() + durationMs;
  const fromEvent = new Date(eventStartsAt).getTime();
  return new Date(Math.min(fromDuration, fromEvent)).toISOString();
}

/**
 * Create a hero boost order (status: PENDING).
 * The organizer pays via UPI and submits a UTR.
 * Admin verifies the payment, which sets the boost to ACTIVE.
 */
export async function createHeroBoost(
  user: CurrentUser,
  eventId: string,
  amountPaise: number,
): Promise<HeroBoost> {
  if (!isSupabaseConfigured()) {
    // Check for existing active/pending boost for this event
    const existing = demoStore().heroBoosts.find(
      (b) => b.eventId === eventId && (b.status === "ACTIVE" || b.status === "PENDING"),
    );
    if (existing) throw new Error("This event already has an active or pending Hero Boost.");

    const boost: HeroBoost = {
      id: `hero-${randomUUID()}`,
      eventId,
      organizerId: "org-basement",
      status: "PENDING",
      amountPaise,
      currency: "INR",
      utrReference: null,
      startedAt: null,
      expiresAt: null,
      cancelledAt: null,
      expiredAt: null,
      createdAt: new Date().toISOString(),
    };
    demoStore().heroBoosts.push(boost);
    return boost;
  }

  // Check for existing active/pending boost
  const supabase = await createClient();
  const { data: existing, error: checkError } = await supabase
    .from("hero_boosts")
    .select("id")
    .eq("event_id", eventId)
    .in("status", ["ACTIVE", "PENDING"])
    .maybeSingle();
  if (checkError) {
    console.error("createHeroBoost check error:", checkError);
    throw new Error(
      "Hero Boosts table not found. Run the latest supabase/schema.sql in your Supabase SQL editor to add the hero_boosts table.",
    );
  }
  if (existing) throw new Error("This event already has an active or pending Hero Boost.");

  // Get organizer ID
  const { getOrganizerProfile } = await import("@/lib/data/organizer");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile found.");

  const { data, error } = await supabase
    .from("hero_boosts")
    .insert({
      event_id: eventId,
      organizer_id: organizer.id,
      status: "PENDING",
      amount_paise: amountPaise,
      currency: "INR",
    })
    .select("*")
    .single();
  if (error) {
    console.error("createHeroBoost insert error:", error);
    const msg = typeof error === "object" && "message" in error ? String(error.message) : "Failed to create boost.";
    throw new Error(msg);
  }
  return toBoost(data);
}

/**
 * Submit UTR for a pending hero boost (organizer action).
 * The boost remains PENDING until admin verifies.
 */
export async function submitHeroBoostUtr(
  user: CurrentUser,
  boostId: string,
  utrReference: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const boost = demoStore().heroBoosts.find((b) => b.id === boostId);
    if (!boost) throw new Error("Boost not found.");
    if (boost.status !== "PENDING") throw new Error("Boost is not pending.");
    boost.utrReference = utrReference;
    return;
  }

  const supabase = await createClient();
  const { data: boost } = await supabase
    .from("hero_boosts")
    .select("organizer_id, status")
    .eq("id", boostId)
    .maybeSingle();
  if (!boost) throw new Error("Boost not found.");
  if (boost.status !== "PENDING") throw new Error("Boost is not pending.");

  // Verify ownership
  const { getOrganizerProfile } = await import("@/lib/data/organizer");
  const organizer = await getOrganizerProfile(user);
  if (!organizer || organizer.id !== boost.organizer_id) {
    throw new Error("Not authorised.");
  }

  const { error } = await supabase
    .from("hero_boosts")
    .update({ utr_reference: utrReference, updated_at: new Date().toISOString() })
    .eq("id", boostId);
  if (error) {
    const msg = typeof error === "object" && "message" in error ? String(error.message) : "Failed to submit UTR.";
    throw new Error(msg);
  }
}

/**
 * Admin: verify a hero boost payment and activate it.
 * Sets status to ACTIVE, started_at to now, expires_at to min(now + duration, event start).
 */
export async function activateHeroBoost(
  boostId: string,
  durationDays: number,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const boost = demoStore().heroBoosts.find((b) => b.id === boostId);
    if (!boost) throw new Error("Boost not found.");
    if (boost.status !== "PENDING") throw new Error("Boost is not pending.");

    // Get event start time
    const event = demoStore().events.find((e) => e.id === boost.eventId);
    if (!event) throw new Error("Event not found.");
    if (new Date(event.startsAt).getTime() <= Date.now()) {
      throw new Error("Cannot boost an event that has already started.");
    }

    const now = new Date().toISOString();
    boost.status = "ACTIVE";
    boost.startedAt = now;
    boost.expiresAt = computeExpiry(now, durationDays, event.startsAt);
    return;
  }

  const supabase = await createClient();
  const { data: boost, error: boostError } = await supabase
    .from("hero_boosts")
    .select("*")
    .eq("id", boostId)
    .maybeSingle();
  if (boostError) {
    console.error("activateHeroBoost: select error:", boostError);
    const msg = typeof boostError === "object" && "message" in boostError ? String(boostError.message) : "Failed to load boost.";
    throw new Error(msg);
  }
  if (!boost) throw new Error("Boost not found. Check RLS policies on hero_boosts table.");
  if (boost.status !== "PENDING") throw new Error("Boost is not pending.");

  // Get event start time
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("starts_at, status")
    .eq("id", boost.event_id)
    .maybeSingle();
  if (eventError) {
    console.error("activateHeroBoost: event select error:", eventError);
    throw new Error("Failed to load event data.");
  }
  if (!event) throw new Error("Event not found.");
  if (new Date(event.starts_at).getTime() <= Date.now()) {
    throw new Error("Cannot boost an event that has already started.");
  }

  const now = new Date().toISOString();
  const expiresAt = computeExpiry(now, durationDays, event.starts_at);

  const { error } = await supabase
    .from("hero_boosts")
    .update({
      status: "ACTIVE",
      started_at: now,
      expires_at: expiresAt,
      updated_at: now,
    })
    .eq("id", boostId);
  if (error) {
    const msg = typeof error === "object" && "message" in error ? String(error.message) : "Failed to activate boost.";
    throw new Error(msg);
  }
}

/**
 * Admin: cancel a hero boost.
 */
export async function cancelHeroBoost(boostId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const boost = demoStore().heroBoosts.find((b) => b.id === boostId);
    if (!boost) throw new Error("Boost not found.");
    boost.status = "CANCELLED";
    boost.cancelledAt = new Date().toISOString();
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("hero_boosts")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", boostId);
  if (error) {
    const msg = typeof error === "object" && "message" in error ? String(error.message) : "Failed to cancel boost.";
    throw new Error(msg);
  }
}

/**
 * Cancel hero boosts for an event (called when event is cancelled).
 */
export async function cancelHeroBoostsForEvent(eventId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    for (const boost of demoStore().heroBoosts) {
      if (boost.eventId === eventId && boost.status === "ACTIVE") {
        boost.status = "CANCELLED";
        boost.cancelledAt = new Date().toISOString();
      }
    }
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("hero_boosts")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId)
    .eq("status", "ACTIVE");
}

/**
 * Get the active or pending hero boost for an event (organizer view).
 */
export async function getHeroBoostForEvent(
  user: CurrentUser,
  eventId: string,
): Promise<HeroBoost | null> {
  if (!isSupabaseConfigured()) {
    return (
      demoStore().heroBoosts.find(
        (b) =>
          b.eventId === eventId &&
          (b.status === "ACTIVE" || b.status === "PENDING"),
      ) ?? null
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hero_boosts")
    .select("*")
    .eq("event_id", eventId)
    .in("status", ["ACTIVE", "PENDING"])
    .maybeSingle();
  if (error) {
    console.error("getHeroBoostForEvent error:", error);
    return null;
  }
  if (!data) return null;
  return toBoost(data);
}

/**
 * Admin: list all hero boosts with event details.
 */
export async function listAllHeroBoosts(): Promise<HeroBoostWithEvent[]> {
  if (!isSupabaseConfigured()) {
    return demoStore().heroBoosts.map((b) => {
      const event = demoStore().events.find((e) => e.id === b.eventId);
      return {
        ...b,
        eventTitle: event?.title ?? "Unknown",
        eventStartsAt: event?.startsAt ?? "",
        eventStatus: event?.status ?? "UNKNOWN",
        organizerName: "Demo Organizer",
      };
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hero_boosts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  const eventIds = [...new Set(data.map((r) => r.event_id))];
  const { data: events } = await supabase
    .from("events")
    .select("id, title, starts_at, status")
    .in("id", eventIds);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e]));

  const organizerIds = [...new Set(data.map((r) => r.organizer_id))];
  const { data: organizers } = await supabase
    .from("organizers")
    .select("id, name")
    .in("id", organizerIds);
  const orgMap = Object.fromEntries((organizers ?? []).map((o) => [o.id, o.name]));

  return data.map((row) => ({
    ...toBoost(row),
    eventTitle: eventMap[row.event_id]?.title ?? "Unknown",
    eventStartsAt: eventMap[row.event_id]?.starts_at ?? "",
    eventStatus: eventMap[row.event_id]?.status ?? "UNKNOWN",
    organizerName: orgMap[row.organizer_id] ?? "Organizer",
  }));
}

/**
 * Admin: list pending hero boosts awaiting verification.
 */
export async function listPendingHeroBoosts(): Promise<HeroBoostWithEvent[]> {
  const all = await listAllHeroBoosts();
  return all.filter((b) => b.status === "PENDING");
}

/**
 * Get eligible hero events for the homepage carousel.
 * Eligibility:
 * - Boost status is ACTIVE
 * - Boost has not expired (expires_at > now)
 * - Event is published
 * - Event has not started (starts_at > now)
 * - Event is not cancelled/deleted
 *
 * Rotation:
 * - Deterministic rotation based on server time
 * - rotation_index = floor(now / rotation_interval)
 * - Events are sorted by event date proximity (sooner = higher priority)
 * - Then rotated by rotation_index to ensure fair exposure
 * - Max `maxVisible` events are returned
 */
export async function getHeroEvents(
  rotationIntervalMinutes: number,
  maxVisible: number,
): Promise<HeroEvent[]> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Get all active, non-expired boosts
  let eligibleBoosts: { boost: HeroBoost; eventId: string; startedAt: string }[] = [];

  if (!isSupabaseConfigured()) {
    eligibleBoosts = demoStore()
      .heroBoosts.filter((b) => b.status === "ACTIVE" && b.expiresAt && b.expiresAt > nowIso)
      .map((b) => ({ boost: b, eventId: b.eventId, startedAt: b.startedAt ?? b.createdAt }));
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hero_boosts")
      .select("*")
      .eq("status", "ACTIVE")
      .gt("expires_at", nowIso);
    if (error || !data || data.length === 0) return [];
    eligibleBoosts = data.map((row) => ({
      boost: toBoost(row),
      eventId: row.event_id,
      startedAt: row.started_at ?? row.created_at,
    }));
  }

  if (eligibleBoosts.length === 0) return [];

  // Fetch events for these boosts
  const eventIds = [...new Set(eligibleBoosts.map((b) => b.eventId))];
  let events: { id: string; title: string; startsAt: string; status: string }[] = [];

  if (!isSupabaseConfigured()) {
    events = demoStore()
      .events.filter((e) => eventIds.includes(e.id))
      .map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, status: e.status }));
  } else {
    const supabase = await createClient();
    const { data: eventData } = await supabase
      .from("events")
      .select("id, title, starts_at, status, city, category, venue_name, card_poster_url, banner_poster_url, is_featured, registrations_count, tags, pricing_mode")
      .in("id", eventIds);
    if (!eventData) return [];
    events = eventData.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      status: e.status,
    }));
  }

  // Filter: event must be published and not started
  const eligible = eligibleBoosts.filter((b) => {
    const event = events.find((e) => e.id === b.eventId);
    if (!event) return false;
    if (event.status !== "PUBLISHED" && event.status !== "POSTPONED") return false;
    if (new Date(event.startsAt).getTime() <= now) return false;
    return true;
  });

  if (eligible.length === 0) return [];

  // Sort by event date proximity (sooner = higher priority)
  const sorted = eligible.sort((a, b) => {
    const eventA = events.find((e) => e.id === a.eventId)!;
    const eventB = events.find((e) => e.id === b.eventId)!;
    return new Date(eventA.startsAt).getTime() - new Date(eventB.startsAt).getTime();
  });

  // Deterministic rotation
  const rotationIntervalMs = rotationIntervalMinutes * 60 * 1000;
  const rotationIndex = Math.floor(now / rotationIntervalMs);
  const offset = rotationIndex % sorted.length;

  // Rotate the sorted list by the offset
  const rotated = [
    ...sorted.slice(offset),
    ...sorted.slice(0, offset),
  ];

  // Take maxVisible
  const visible = rotated.slice(0, maxVisible);

  // Build HeroEvent objects
  if (!isSupabaseConfigured()) {
    return visible.map((b) => {
      const event = demoStore().events.find((e) => e.id === b.eventId)!;
      return {
        id: event.id,
        title: event.title,
        category: event.category,
        city: event.city,
        venueName: event.venueName,
        startsAt: event.startsAt,
        cardPosterUrl: event.cardPosterUrl,
        bannerPosterUrl: event.bannerPosterUrl,
        minPricePaise: Math.min(...event.tiers.map((t) => t.pricePaise)),
        isFeatured: event.isFeatured,
        registrationsCount: event.registrationsCount,
        tags: event.tags,
        pricingMode: event.pricingMode,
        heroBoostId: b.boost.id,
        heroStartedAt: b.boost.startedAt ?? b.boost.createdAt,
        heroExpiresAt: b.boost.expiresAt ?? "",
      };
    });
  }

  // Supabase mode: fetch full event details
  const supabase = await createClient();
  const visibleEventIds = visible.map((b) => b.eventId);
  const { data: fullEvents } = await supabase
    .from("events")
    .select("*")
    .in("id", visibleEventIds);

  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("event_id, price_paise")
    .in("event_id", visibleEventIds);

  return visible.map((b) => {
    const row = fullEvents?.find((e) => e.id === b.eventId);
    if (!row) return null;
    const eventTiers = (tiers ?? []).filter((t) => t.event_id === row.id);
    const minPrice = eventTiers.length > 0 ? Math.min(...eventTiers.map((t) => t.price_paise)) : 0;
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      city: row.city,
      venueName: row.venue_name,
      startsAt: row.starts_at,
      cardPosterUrl: row.card_poster_url,
      bannerPosterUrl: row.banner_poster_url,
      minPricePaise: minPrice,
      isFeatured: row.is_featured,
      registrationsCount: row.registrations_count,
      tags: row.tags ?? [],
      pricingMode: row.pricing_mode,
      heroBoostId: b.boost.id,
      heroStartedAt: b.boost.startedAt ?? b.boost.createdAt,
      heroExpiresAt: b.boost.expiresAt ?? "",
    };
  }).filter((e): e is HeroEvent => e !== null);
}
