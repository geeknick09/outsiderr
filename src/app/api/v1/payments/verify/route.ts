import { z } from "zod";

import { apiError, apiOk, readJson, runVerifyPayment, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  paymentMethod: z.string().optional().nullable(),
});

/**
 * POST /api/v1/payments/verify — verify the Razorpay signature server-side and
 * confirm the order (idempotent — the webhook may have already confirmed it).
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const result = await runVerifyPayment(user, parsed.data);
    if (!result.success) return apiError(result.error ?? "Verification failed.", 400);
    return apiOk({ orderId: result.orderId });
  });
}
