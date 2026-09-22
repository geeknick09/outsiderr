import { z } from "zod";

import { apiError, apiOk, readJson, runCheckout, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  tierId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  buyerName: z.string().max(200).optional().nullable(),
  buyerPhone: z.string().max(20).optional().nullable(),
  buyerEmail: z.string().email().max(200).optional().nullable(),
  buyerGender: z.string().max(50).optional().nullable(),
});

/**
 * POST /api/v1/checkout — reserve inventory + create a Razorpay order.
 * Returns a CheckoutSession the client feeds to the Razorpay SDK.
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const result = await runCheckout(user, parsed.data);
    if (result.error) return apiError(result.error, 400);
    return apiOk({ session: result.session });
  });
}
