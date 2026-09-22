import { z } from "zod";

import { apiError, apiOk, readJson, requestBoost, getOrganizerProfile, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  slot: z.number().int().min(1).max(10),
  amountPaidPaise: z.number().int().min(0),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  utrReference: z.string().min(1, "Enter your UTR reference.").max(100),
});

/**
 * POST /api/v1/boosts — request a homepage boost slot for an event.
 * Auth: Bearer <supabase-access-token> (organizer)
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const organizer = await getOrganizerProfile(user);
    if (!organizer) return apiError("Create an organizer profile first.", 400);

    try {
      const boost = await requestBoost(user, {
        ...parsed.data,
        organizerId: organizer.id,
      });
      return apiOk({ boost });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not request boost.", 400);
    }
  });
}
