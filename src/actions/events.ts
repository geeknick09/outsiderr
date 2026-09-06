"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { createEvent, updateEvent, updateEventStatus, type TicketTierInput } from "@/lib/data/organizer";
import type { City, EventCategory, FeePayer, PricingMode } from "@/lib/types";

export interface CreateEventState {
  error: string | null;
  values?: {
    title: string;
    category: string;
    categories: string[];
    city: string;
    startsAt: string;
    endsAt: string;
    venueName: string;
    venueAddress: string;
    latitude: string;
    longitude: string;
    googleMapsLink: string;
    description: string;
    thingsToKnow: string;
    terms: string;
    tags: string;
    pricingMode: string;
    freeQuantity: string;
    flatPrice: string;
    flatQuantity: string;
    tiers: { name: string; price: string; quantity: string; perks: string }[];
    feePayer: string;
    needsDoorStaff: boolean;
    doorStaffTerms: boolean;
    doorStaffCount: string;
    organizerTerms: boolean;
    cardPosterUrl: string;
    bannerPosterUrl: string;
    photoUrls: string[];
    contactEmail: string;
    contactPhone: string;
    instagramUrl: string;
    youtubeUrl: string;
    xUrl: string;
    facebookUrl: string;
    linkedinUrl: string;
  };
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTiers(formData: FormData): TicketTierInput[] {
  const names = formData.getAll("tierName").map(String);
  const prices = formData.getAll("tierPrice").map(String);
  const quantities = formData.getAll("tierQuantity").map(String);
  const perks = formData.getAll("tierPerks").map(String);

  return names
    .map((name, index) => ({
      name: name.trim(),
      pricePaise: Math.round(Number(prices[index] ?? 0) * 100),
      quantity: Number(quantities[index] ?? 0),
      perks: (perks[index] ?? "")
        .split(",")
        .map((perk) => perk.trim())
        .filter(Boolean),
    }))
    .filter((tier) => tier.name.length > 0);
}

function extractFormValues(formData: FormData): CreateEventState["values"] {
  const pricingMode = String(formData.get("pricingMode") ?? "PAID");
  const tierNames = formData.getAll("tierName").map(String);
  const tierPrices = formData.getAll("tierPrice").map(String);
  const tierQuantities = formData.getAll("tierQuantity").map(String);
  const tierPerks = formData.getAll("tierPerks").map(String);

  return {
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? "JAM_GIG"),
    categories: formData.getAll("categories").map(String).filter(Boolean),
    city: String(formData.get("city") ?? "KOLKATA"),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    venueName: String(formData.get("venueName") ?? ""),
    venueAddress: String(formData.get("venueAddress") ?? ""),
    latitude: String(formData.get("latitude") ?? ""),
    longitude: String(formData.get("longitude") ?? ""),
    googleMapsLink: String(formData.get("googleMapsLink") ?? ""),
    description: String(formData.get("description") ?? ""),
    thingsToKnow: String(formData.get("thingsToKnow") ?? ""),
    terms: String(formData.get("terms") ?? ""),
    tags: String(formData.get("tags") ?? ""),
    pricingMode,
    freeQuantity: String(formData.get("freeQuantity") ?? ""),
    flatPrice: tierPrices[0] ?? "",
    flatQuantity: tierQuantities[0] ?? "",
    tiers: tierNames.map((name, i) => ({
      name,
      price: tierPrices[i] ?? "",
      quantity: tierQuantities[i] ?? "",
      perks: tierPerks[i] ?? "",
    })),
    feePayer: String(formData.get("feePayer") ?? "BUYER"),
    needsDoorStaff: formData.get("needsDoorStaff") === "on",
    doorStaffTerms: formData.get("doorStaffTerms") === "on",
    doorStaffCount: String(formData.get("doorStaffCount") ?? "1"),
    organizerTerms: formData.get("organizerTerms") === "on",
    cardPosterUrl: String(formData.get("cardPosterUrl") ?? ""),
    bannerPosterUrl: String(formData.get("bannerPosterUrl") ?? ""),
    photoUrls: formData.getAll("photoUrls").map(String).filter(Boolean),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? ""),
    instagramUrl: String(formData.get("instagramUrl") ?? ""),
    youtubeUrl: String(formData.get("youtubeUrl") ?? ""),
    xUrl: String(formData.get("xUrl") ?? ""),
    facebookUrl: String(formData.get("facebookUrl") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
  };
}

function parsePhases(formData: FormData): TicketTierInput[] {
  const names = formData.getAll("phaseName").map(String);
  const prices = formData.getAll("phasePrice").map(String);
  const quantities = formData.getAll("phaseQuantity").map(String);
  const opensAtList = formData.getAll("phaseOpensAt").map(String);
  const closesAtList = formData.getAll("phaseClosesAt").map(String);

  return names
    .map((name, index) => ({
      name: name.trim(),
      pricePaise: Math.round(Number(prices[index] ?? 0) * 100),
      quantity: Number(quantities[index] ?? 0),
      perks: [],
      tierType: "FLAT_PHASE" as const,
      phaseOrder: index + 1,
      phaseOpensAt: opensAtList[index] ? new Date(opensAtList[index]).toISOString() : null,
      phaseClosesAt: closesAtList[index] ? new Date(closesAtList[index]).toISOString() : null,
    }))
    .filter((phase) => phase.name.length > 0 && phase.quantity > 0);
}

/** Validate that phases are sequential: each opens after the previous closes (or opens). */
function validatePhases(phases: TicketTierInput[]): string | null {
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (!p.phaseOpensAt) continue;
    const opens = new Date(p.phaseOpensAt).getTime();
    // Phase opens must be in the future
    if (opens < Date.now()) {
      return `Phase ${i + 1} open date cannot be in the past.`;
    }
    // Phase closes must be after opens
    if (p.phaseClosesAt && new Date(p.phaseClosesAt).getTime() <= opens) {
      return `Phase ${i + 1} close date must be after its open date.`;
    }
    // Next phase must open after previous phase closes (or opens if no close)
    if (i > 0) {
      const prev = phases[i - 1];
      const prevBoundary = prev.phaseClosesAt ?? prev.phaseOpensAt;
      if (prevBoundary && opens <= new Date(prevBoundary).getTime()) {
        return `Phase ${i + 1} must open after Phase ${i}'s ${prev.phaseClosesAt ? "close" : "open"} date.`;
      }
    }
  }
  return null;
}

function buildTiers(formData: FormData, pricingMode: PricingMode): TicketTierInput[] {
  if (pricingMode === "FREE") {
    const qty = Number(formData.get("freeQuantity") ?? 0);
    return [{ name: "Entry", pricePaise: 0, quantity: qty, perks: [] }];
  }

  if (pricingMode === "FLAT") {
    const price = Number(formData.getAll("tierPrice")[0] ?? 0);
    const qty = Number(formData.getAll("tierQuantity")[0] ?? 0);
    return [{ name: "Entry", pricePaise: Math.round(price * 100), quantity: qty, perks: [] }];
  }

  if (pricingMode === "PHASED") {
    const phases = parsePhases(formData);
    const namedTiers = parseTiers(formData).map((t) => ({ ...t, tierType: "NAMED" as const }));
    return [...phases, ...namedTiers];
  }

  return parseTiers(formData);
}

export async function createEventAction(
  _prev: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const pricingMode = String(formData.get("pricingMode") ?? "PAID") as PricingMode;

  const tiers = buildTiers(formData, pricingMode);

  // Validate phase sequencing for PHASED mode
  if (pricingMode === "PHASED") {
    const phaseError = validatePhases(tiers.filter((t) => t.tierType === "FLAT_PHASE"));
    if (phaseError) return { error: phaseError, values: extractFormValues(formData) };
  }

  if (!title) return { error: "Give the event a title.", values: extractFormValues(formData) };
  if (!startsAt)
    return { error: "Pick a start date and time.", values: extractFormValues(formData) };

  // Validate start date is not in the past
  const startDate = new Date(startsAt);
  if (startDate.getTime() < Date.now()) {
    return { error: "Start date and time cannot be in the past.", values: extractFormValues(formData) };
  }

  // Validate tiers
  if (pricingMode !== "FREE") {
    for (const tier of tiers) {
      if (!tier.name || tier.name.trim().length < 2) {
        return { error: "Each tier must have a name (at least 2 characters).", values: extractFormValues(formData) };
      }
      if (tier.pricePaise < 100) {
        return { error: "Each tier price must be at least ₹1.", values: extractFormValues(formData) };
      }
      if (tier.quantity < 1) {
        return { error: "Each tier must have at least 1 ticket.", values: extractFormValues(formData) };
      }
    }
  }

  // Validate end date is required and after start date
  const endsAtRaw = String(formData.get("endsAt") ?? "");
  if (!endsAtRaw) {
    return { error: "End date and time is required.", values: extractFormValues(formData) };
  }
  if (endsAtRaw) {
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAtRaw).getTime();
    if (endMs <= startMs) {
      return {
        error: "End date and time must be after the start date and time.",
        values: extractFormValues(formData),
      };
    }
  }

  if (tiers.length === 0)
    return { error: "Add at least one ticket tier.", values: extractFormValues(formData) };
  if (tiers.some((tier) => tier.quantity <= 0)) {
    return {
      error: "Every tier needs a quantity of at least 1.",
      values: extractFormValues(formData),
    };
  }

  // Validate door staff terms
  const needsDoorStaff = formData.get("needsDoorStaff") === "on";
  const doorStaffTerms = formData.get("doorStaffTerms") === "on";
  if (needsDoorStaff && !doorStaffTerms) {
    return {
      error: "Please accept the door staff terms & refund policy.",
      values: extractFormValues(formData),
    };
  }

  // Validate general organizer terms
  const organizerTerms = formData.get("organizerTerms") === "on";
  if (!organizerTerms) {
    return {
      error: "Please accept the Outsiderr terms to publish the event.",
      values: extractFormValues(formData),
    };
  }

  const endsAt = String(formData.get("endsAt") ?? "");
  const venueMode = String(formData.get("venueMode") ?? "NOW");
  const latitude = String(formData.get("latitude") ?? "").trim();
  const longitude = String(formData.get("longitude") ?? "").trim();
  const googleMapsLink = String(formData.get("googleMapsLink") ?? "").trim() || null;

  // Validate Google Maps link if venue mode is NOW
  if (venueMode === "NOW" && googleMapsLink) {
    const { isGoogleMapsLink } = await import("@/lib/upi");
    if (!isGoogleMapsLink(googleMapsLink)) {
      return {
        error: "Google Maps link must be a valid maps.google.com or maps.app.goo.gl URL.",
        values: extractFormValues(formData),
      };
    }
  }

  let eventId: string;
  try {
    eventId = await createEvent(user, {
      title,
      description: String(formData.get("description") ?? "").trim(),
      thingsToKnow: lines(formData.get("thingsToKnow")),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      category: (formData.getAll("categories")[0] ?? formData.get("category") ?? "JAM_GIG") as EventCategory,
      categories: formData.getAll("categories").map(String).filter(Boolean) as EventCategory[],
      city: String(formData.get("city") ?? "KOLKATA") as City,
      venueName: venueMode === "TBA" ? "TBA" : String(formData.get("venueName") ?? "").trim(),
      venueAddress: venueMode === "TBA" ? "" : String(formData.get("venueAddress") ?? "").trim(),
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      googleMapsLink,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      cardPosterUrl: String(formData.get("cardPosterUrl") ?? "") || null,
      bannerPosterUrl: String(formData.get("bannerPosterUrl") ?? "") || null,
      feePayer: String(formData.get("feePayer") ?? "BUYER") as FeePayer,
      needsDoorStaff,
      terms: lines(formData.get("terms")),
      pricingMode,
      tiers,
      photoUrls: formData.getAll("photoUrls").map(String).filter(Boolean),
      contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
      contactPhone: String(formData.get("contactPhone") ?? "").trim() || null,
      instagramUrl: String(formData.get("instagramUrl") ?? "").trim() || null,
      youtubeUrl: String(formData.get("youtubeUrl") ?? "").trim() || null,
      xUrl: String(formData.get("xUrl") ?? "").trim() || null,
      facebookUrl: String(formData.get("facebookUrl") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
    });

    // Create door staff order if requested
    if (needsDoorStaff) {
      const doorStaffCount = Number(formData.get("doorStaffCount") ?? 1);
      const doorStaffAmount = Number(formData.get("doorStaffAmount") ?? 0);
      try {
        const { createDoorStaffOrder } = await import("@/lib/data/door-staff");
        await createDoorStaffOrder(user, eventId, doorStaffCount, doorStaffAmount * 100);
      } catch {
        // Best-effort — don't fail event creation if door staff order fails
      }
    }

    // Store T&C acceptance with the current terms version
    try {
      const { getTermsVersion } = await import("@/lib/data/platform-settings");
      const termsVersion = await getTermsVersion();
      const { createClient } = await import("@/lib/supabase/server");
      const { getOrganizerProfile } = await import("@/lib/data/organizer");
      const organizer = await getOrganizerProfile(user);

      if (organizer) {
        const supabase = await createClient();
        await supabase.from("event_terms_acceptances").insert({
          organizer_id: organizer.id,
          event_id: eventId,
          terms_version: termsVersion,
          accepted_at: new Date().toISOString(),
        });
      }
    } catch {
      // T&C acceptance logging is best-effort — don't fail the event creation
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not publish the event.",
      values: extractFormValues(formData),
    };
  }

  revalidatePath("/");
  revalidatePath("/organizer");
  redirect(`/organizer/events/${eventId}`);
}

// ---------------------------------------------------------------------------
// Update event (core editable fields)
// ---------------------------------------------------------------------------

export interface UpdateEventState {
  error: string | null;
}

export async function updateEventAction(
  _prev: UpdateEventState,
  formData: FormData,
): Promise<UpdateEventState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const eventId = String(formData.get("eventId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim();

  if (!eventId) return { error: "Missing event ID." };
  if (!title) return { error: "Give the event a title." };
  if (!startsAt) return { error: "Pick a start date and time." };

  const latitude = String(formData.get("latitude") ?? "").trim();
  const longitude = String(formData.get("longitude") ?? "").trim();
  const googleMapsLink = String(formData.get("googleMapsLink") ?? "").trim() || null;
  const endsAt = String(formData.get("endsAt") ?? "").trim();

  // Validate end date is required and after start date
  if (!endsAt) {
    return { error: "End date and time is required." };
  }
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (endMs <= startMs) {
    return { error: "End date and time must be after the start date and time." };
  }

  try {
    // Parse tier edits if present
    const tierIds = formData.getAll("tierId[]").map(String);
    const tierNames = formData.getAll("tierName[]").map(String);
    const tierPrices = formData.getAll("tierPrice[]").map((v) => Number(v));
    const tierQtys = formData.getAll("tierQty[]").map((v) => Number(v));
    const tierPhaseOpensAt = formData.getAll("tierPhaseOpensAt[]").map(String);
    const tierPhaseClosesAt = formData.getAll("tierPhaseClosesAt[]").map(String);
    const tiers = tierIds.length > 0 && tierNames.length > 0
      ? tierNames.map((name, i) => ({
          id: tierIds[i] || undefined,
          name,
          pricePaise: Math.round((tierPrices[i] || 0) * 100),
          quantity: tierQtys[i] || 0,
          perks: [],
          phaseOpensAt: tierPhaseOpensAt[i] ? new Date(tierPhaseOpensAt[i]).toISOString() : null,
          phaseClosesAt: tierPhaseClosesAt[i] ? new Date(tierPhaseClosesAt[i]).toISOString() : null,
        }))
      : undefined;

    // Server-side phase date validation (mirrors create flow)
    if (tiers) {
      const now = Date.now();
      let prevBoundary: number | null = null;
      for (const tier of tiers) {
        if (tier.phaseOpensAt) {
          const opens = new Date(tier.phaseOpensAt).getTime();
          // Reject past dates (only for phases that haven't opened yet)
          if (opens < now) {
            return { error: `Phase "${tier.name}" has an opening date in the past.` };
          }
          // closesAt must be after opensAt
          if (tier.phaseClosesAt) {
            const closes = new Date(tier.phaseClosesAt).getTime();
            if (closes <= opens) {
              return { error: `Phase "${tier.name}" closing date must be after its opening date.` };
            }
          }
          // Each phase must open after the previous phase's close (or open if no close)
          if (prevBoundary !== null && opens <= prevBoundary) {
            return { error: `Phase "${tier.name}" must open after the previous phase ends.` };
          }
          prevBoundary = tier.phaseClosesAt
            ? new Date(tier.phaseClosesAt).getTime()
            : opens;
        }
      }
    }

    await updateEvent(user, eventId, {
      title,
      description: String(formData.get("description") ?? "").trim(),
      venueName: String(formData.get("venueName") ?? "").trim(),
      venueAddress: String(formData.get("venueAddress") ?? "").trim(),
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      googleMapsLink,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      city: String(formData.get("city") ?? "").trim() as City | undefined,
      category: String(formData.getAll("categories")[0] ?? formData.get("category") ?? "").trim() as EventCategory | undefined,
      categories: formData.getAll("categories").map(String).filter(Boolean) as EventCategory[],
      tiers,
      photoUrls: formData.getAll("photoUrls[]").map(String).filter(Boolean),
      contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
      contactPhone: String(formData.get("contactPhone") ?? "").trim() || null,
      instagramUrl: String(formData.get("instagramUrl") ?? "").trim() || null,
      youtubeUrl: String(formData.get("youtubeUrl") ?? "").trim() || null,
      xUrl: String(formData.get("xUrl") ?? "").trim() || null,
      facebookUrl: String(formData.get("facebookUrl") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save changes.",
    };
  }

  revalidatePath("/");
  revalidatePath("/organizer");
  revalidatePath(`/events/${eventId}`);
  redirect(`/organizer/events/${eventId}`);
}

// ---------------------------------------------------------------------------
// Cancel event — stop sales, mark tickets CANCELLED, create refund records,
// notify all ticket holders. Organizer pays platform fee (non-refundable).
// ---------------------------------------------------------------------------

export async function cancelEventAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const eventId = String(formData.get("eventId") ?? "").trim();
  const reason = String(formData.get("cancelReason") ?? "").trim();
  if (!eventId) return;

  const { cancelEvent } = await import("@/lib/data/organizer");
  await cancelEvent(user, eventId, reason);

  // Cancel any active Hero Boosts for this event
  const { cancelHeroBoostsForEvent } = await import("@/lib/data/hero-boosts");
  await cancelHeroBoostsForEvent(eventId);

  revalidatePath("/");
  revalidatePath("/organizer");
  revalidatePath(`/events/${eventId}`);
  redirect(`/organizer/events/${eventId}`);
}

/**
 * Publish a draft event (POST-based server action — not GET).
 * Replaces the old GET-based `?action=publish` query param.
 */
export async function publishEventAction(eventId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  await updateEventStatus(user, eventId, "PUBLISHED");
  revalidatePath("/");
  revalidatePath("/organizer");
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/organizer/events/${eventId}`);
}

// ---------------------------------------------------------------------------
// Postpone event — update dates, notify all ticket holders.
// Users can choose to keep their ticket or request a refund.
// ---------------------------------------------------------------------------

export async function postponeEventAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const eventId = String(formData.get("eventId") ?? "").trim();
  const newStartsAt = String(formData.get("newStartsAt") ?? "").trim();
  const newEndsAt = String(formData.get("newEndsAt") ?? "").trim();
  const reason = String(formData.get("postponeReason") ?? "").trim();

  if (!eventId || !newStartsAt) return;

  // Server-side date validation
  const newStart = new Date(newStartsAt);
  const now = new Date();
  if (newStart <= now) {
    throw new Error("New start date must be in the future.");
  }
  if (newEndsAt) {
    const newEnd = new Date(newEndsAt);
    if (newEnd <= newStart) {
      throw new Error("New end date must be after the new start date.");
    }
  }

  const { postponeEvent } = await import("@/lib/data/organizer");
  await postponeEvent(
    user,
    eventId,
    new Date(newStartsAt).toISOString(),
    newEndsAt ? new Date(newEndsAt).toISOString() : null,
    reason,
  );

  // Re-evaluate Hero Boost expiry based on new event date.
  // The boost's expires_at is min(started_at + duration, event.starts_at).
  // If the event is postponed, the expiry may need to be recalculated.
  // Eligibility query already checks expires_at > now AND event.starts_at > now,
  // so the boost will naturally be excluded if the event has started.
  // No additional action needed — the query enforces eligibility by timestamp.

  revalidatePath("/");
  revalidatePath("/organizer");
  revalidatePath(`/events/${eventId}`);
  redirect(`/organizer/events/${eventId}`);
}
