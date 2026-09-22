import { z } from "zod";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { submitReview } from "@/modules/shared/actions/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().max(1000).optional().nullable(),
});

/**
 * POST /api/v1/reviews — submit a review (requires a USED ticket for the event).
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const res = await submitReview(parsed.data.eventId, parsed.data.rating, parsed.data.reviewText ?? null);
    return res.success ? apiOk({ reviewed: true }) : apiError(res.error ?? "Could not submit review.", 400);
  });
}
