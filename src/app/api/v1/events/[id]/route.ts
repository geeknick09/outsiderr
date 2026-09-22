import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { isGoogleMapsLink } from "@/modules/shared";
import { updateEvent } from "@/modules/organizer/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).default(""),
  venueName: z.string().max(200).default(""),
  venueAddress: z.string().max(500).default(""),
  venueTba: z.boolean().default(false),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  googleMapsLink: z.string().optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  city: z.string().optional(),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tiers: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    pricePaise: z.number().int().min(0),
    quantity: z.number().int().min(0),
    perks: z.array(z.string()).default([]),
    phaseOpensAt: z.string().optional().nullable(),
    phaseClosesAt: z.string().optional().nullable(),
  })).optional(),
  photoUrls: z.array(z.string()).max(8).optional(),
  contactEmail: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  instagramUrl: z.string().optional().nullable(),
  youtubeUrl: z.string().optional().nullable(),
  xUrl: z.string().optional().nullable(),
  facebookUrl: z.string().optional().nullable(),
  linkedinUrl: z.string().optional().nullable(),
  waitlistEnabled: z.boolean().optional(),
  allowBookingDuringEvent: z.boolean().optional(),
  thingsToKnow: z.array(z.string()).optional(),
  terms: z.array(z.string()).optional(),
  cardPosterUrl: z.string().optional().nullable(),
  bannerPosterUrl: z.string().optional().nullable(),
  teaserVideoUrl: z.string().optional().nullable(),
  linkedPastEventIds: z.array(z.string().uuid()).optional(),
});

/**
 * PATCH /api/v1/events/[id] — update an event's editable fields.
 * Auth: Bearer <supabase-access-token> (event owner/staff)
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;
    const input = parsed.data;

    if (!input.startsAt) return apiError("Pick a start date and time.", 400);
    if (input.endsAt && new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
      return apiError("End date and time must be after the start date and time.", 400);
    }
    if (!input.venueTba && input.googleMapsLink && !isGoogleMapsLink(input.googleMapsLink)) {
      return apiError("Google Maps link must be a valid maps.google.com or maps.app.goo.gl URL.", 400);
    }

    try {
      await updateEvent(user, id, {
        title: input.title,
        description: input.description,
        venueName: input.venueTba ? "TBA" : input.venueName,
        venueAddress: input.venueTba ? "" : input.venueAddress,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        googleMapsLink: input.googleMapsLink ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        tags: input.tags,
        city: input.city as never,
        category: input.category as never,
        categories: input.categories as never,
        tiers: input.tiers,
        photoUrls: input.photoUrls,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        instagramUrl: input.instagramUrl ?? null,
        youtubeUrl: input.youtubeUrl ?? null,
        xUrl: input.xUrl ?? null,
        facebookUrl: input.facebookUrl ?? null,
        linkedinUrl: input.linkedinUrl ?? null,
        waitlistEnabled: input.waitlistEnabled,
        allowBookingDuringEvent: input.allowBookingDuringEvent,
        thingsToKnow: input.thingsToKnow,
        terms: input.terms,
        cardPosterUrl: input.cardPosterUrl ?? null,
        bannerPosterUrl: input.bannerPosterUrl ?? null,
        teaserVideoUrl: input.teaserVideoUrl ?? null,
        linkedPastEventIds: input.linkedPastEventIds,
      });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not update the event.", 400);
    }

    revalidatePath("/");
    revalidateTag("events");
    revalidatePath(`/events/${id}`);

    return apiOk({ eventId: id });
  });
}
