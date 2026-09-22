import { z } from "zod";

import { apiError, apiOk, readJson, runPaymentFailure, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  razorpayOrderId: z.string().min(1),
});

/**
 * POST /api/v1/payments/failure — release a RESERVED order's inventory when the
 * payer abandons or the payment fails.
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const result = await runPaymentFailure(user, parsed.data);
    if (!result.success) return apiError(result.error ?? "Could not release reservation.", 400);
    return apiOk({ released: true });
  });
}
