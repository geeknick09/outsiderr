import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";

import { apiError, apiOk, createClient, createDoorStaffOrder, getOrganizerProfile, getTermsVersion, readJson, withApiUser } from "@/modules/shared/server";
import { isGoogleMapsLink } from "@/modules/shared";
import { createEvent } from "@/modules/organizer/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tierSchema = z.object({
  name: z.string().min(2, "Each tier must have a name (at least 2 characters)."),
  pricePaise: z.number().int().min(0),
  quantity: z.number().int().min(1, "Each tier must have at least 1 ticket."),
  perks: z.array(z.string()).default([]),
  tierType: z.enum(["NAMED", "FLAT_PHASE"]).optional(),
  phaseOrder: z.number().int().optional().nullable(),
  phaseOpensAt: z.string().optional().nullable(),
  phaseClosesAt: z.string().optional().nullable(),
});

const bodySchema = z.object({
  title: z.string().min(1, "Give the event a title.").max(200),
  description: z.string().max(10000).default(""),
  thingsToKnow: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  category: z.string().default("JAM_GIG"),
  categories: z.array(z.string()).default([]),
  city: z.string().default("KOLKATA"),
  venueName: z.string().max(200).default(""),
  venueAddress: z.string().max(500).default(""),
  venueTba: z.boolean().default(false),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  googleMapsLink: z.string().optional().nullable(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  cardPosterUrl: z.string().optional().nullable(),
  bannerPosterUrl: z.string().optional().nullable(),
  teaserVideoUrl: z.string().optional().nullable(),
  feePayer: z.enum(["BUYER", "ORGANIZER"]).default("BUYER"),
  needsDoorStaff: z.boolean().default(false),
  doorStaffCount: z.number().int().min(1).optional(),
  doorStaffAmountPaise: z.number().int().min(0).optional(),
  waitlistEnabled: z.boolean().default(true),
  terms: z.array(z.string()).default([]),
  pricingMode: z.enum(["FREE", "FLAT", "PAID", "PHASED"]).default("PAID"),
  tiers: z.array(tierSchema).default([]),
  photoUrls: z.array(z.string()).max(8).default([]),
  contactEmail: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  instagramUrl: z.string().optional().nullable(),
  youtubeUrl: z.string().optional().nullable(),
  xUrl: z.string().optional().nullable(),
  facebookUrl: z.string().optional().nullable(),
  linkedinUrl: z.string().optional().nullable(),
  linkedPastEventIds: z.array(z.string().uuid()).default([]),
  isDraft: z.boolean().default(false),
  acceptedOrganizerTerms: z.boolean().default(false),
});

/**
 * POST /api/v1/events — create an event (draft or published).
 * Structured JSON contract: ISO datetimes, paise amounts, arrays — no FormData.
 * Auth: Bearer <supabase-access-token> (organizer)
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;
    const input = parsed.data;

    if (!input.isDraft) {
      if (!input.startsAt) return apiError("Pick a start date and time.", 400);
      if (new Date(input.startsAt).getTime() < Date.now()) {
        return apiError("Start date and time cannot be in the past.", 400);
      }
      if (!input.endsAt) return apiError("End date and time is required.", 400);
      if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
        return apiError("End date and time must be after the start date and time.", 400);
      }
      if (input.tiers.length === 0) return apiError("Add at least one ticket tier.", 400);
      if (input.pricingMode !== "FREE" && input.tiers.some((t) => t.pricePaise < 100)) {
        return apiError("Each tier price must be at least ₹1.", 400);
      }
      if (!input.venueTba) {
        if (!input.googleMapsLink) {
          return apiError("Google Maps link is required when venue is not TBA.", 400);
        }
        if (!isGoogleMapsLink(input.googleMapsLink)) {
          return apiError("Google Maps link must be a valid maps.google.com or maps.app.goo.gl URL.", 400);
        }
      }
      if (!input.acceptedOrganizerTerms) {
        return apiError("Please accept the Outsiderr terms to publish the event.", 400);
      }
    }

    let eventId: string;
    try {
      eventId = await createEvent(user, {
        title: input.title,
        description: input.description,
        thingsToKnow: input.thingsToKnow,
        tags: input.tags,
        category: input.category as never,
        categories: input.categories as never,
        city: input.city as never,
        venueName: input.venueTba ? "TBA" : input.venueName,
        venueAddress: input.venueTba ? "" : input.venueAddress,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        googleMapsLink: input.googleMapsLink ?? null,
        startsAt: input.startsAt ?? "",
        endsAt: input.endsAt ?? null,
        cardPosterUrl: input.cardPosterUrl ?? null,
        bannerPosterUrl: input.bannerPosterUrl ?? null,
        teaserVideoUrl: input.teaserVideoUrl ?? null,
        feePayer: input.feePayer,
        needsDoorStaff: input.needsDoorStaff,
        waitlistEnabled: input.waitlistEnabled,
        terms: input.terms,
        pricingMode: input.pricingMode,
        tiers: input.tiers,
        photoUrls: input.photoUrls,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        instagramUrl: input.instagramUrl ?? null,
        youtubeUrl: input.youtubeUrl ?? null,
        xUrl: input.xUrl ?? null,
        facebookUrl: input.facebookUrl ?? null,
        linkedinUrl: input.linkedinUrl ?? null,
        linkedPastEventIds: input.linkedPastEventIds,
        status: input.isDraft ? "DRAFT" : "PUBLISHED",
      });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not publish the event.", 400);
    }

    // Door-staff order (best-effort — same as the web action)
    if (input.needsDoorStaff) {
      try {
        await createDoorStaffOrder(user, eventId, input.doorStaffCount ?? 1, input.doorStaffAmountPaise ?? 0);
      } catch {
        // Non-critical
      }
    }

    // Store T&C acceptance (best-effort — same as the web action)
    try {
      const termsVersion = await getTermsVersion();
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
      // best-effort
    }

    revalidatePath("/");
    revalidateTag("events");
    revalidatePath("/organizer");

    return apiOk({ eventId });
  });
}
