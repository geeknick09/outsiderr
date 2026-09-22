import { z } from "zod";

import { apiError, apiOk, readJson, runPostponementRefund, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
});

/**
 * POST /api/v1/refunds/postponement — request a refund for a postponed event.
 * Auto-refunds via Razorpay when the order was paid online.
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const result = await runPostponementRefund(user, parsed.data.eventId);
    if (!result.success) return apiError(result.error ?? "Could not request refund.", 400);
    return apiOk({ refunded: true });
  });
}
