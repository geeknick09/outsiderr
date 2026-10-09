import { z } from "zod";

import { apiError, apiOk, readJson, startPayment, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["HERO_BOOST", "SLOT_BOOST", "DOOR_STAFF", "CLUB_MEMBERSHIP"]),
  refId: z.string().uuid(),
  idempotencyKey: z.string().max(128).optional().nullable(),
});

/**
 * POST /api/v1/payments/intent - create a payment intent + Razorpay order for
 * a non-ticket payable (boost / door staff / community membership). Ticket orders
 * go through /api/v1/checkout.
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const { result, error } = await startPayment(user, parsed.data);
    if (error || !result) return apiError(error ?? "Could not start payment.", 400);
    return apiOk({
      intentId: result.intentId,
      razorpayOrderId: result.razorpayOrderId,
      amountPaise: result.amountPaise,
      currency: result.currency,
      keyId: result.keyId,
      expiresAt: result.expiresAt,
    });
  });
}