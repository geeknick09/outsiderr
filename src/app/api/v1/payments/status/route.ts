import { z } from "zod";

import { apiError, apiOk, getPaymentStatus, readJson, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  orderId: z.string().uuid().optional(),
  intentId: z.string().uuid().optional(),
  razorpayOrderId: z.string().optional(),
});

/**
 * GET /api/v1/payments/status — poll the current state of a payment/order
 * (for the checkout-status poller on mobile/web clients).
 * Auth: Bearer <supabase-access-token>
 */
export async function GET(request: Request) {
  return withApiUser(request, async (user) => {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      orderId: url.searchParams.get("orderId") ?? undefined,
      intentId: url.searchParams.get("intentId") ?? undefined,
      razorpayOrderId: url.searchParams.get("razorpayOrderId") ?? undefined,
    });
    if (!parsed.success) return apiError("Invalid query.", 400);

    const status = await getPaymentStatus(user, parsed.data);
    if (!status) return apiError("Not found.", 404);
    return apiOk(status);
  });
}