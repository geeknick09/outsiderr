import { z } from "zod";

import { apiError, apiOk, readJson, runManualCheckout, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  tierId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  isFree: z.boolean().default(false),
  buyerName: z.string().max(200).optional().nullable(),
  buyerPhone: z.string().max(20).optional().nullable(),
  buyerEmail: z.string().email().max(200).optional().nullable(),
  buyerGender: z.string().max(50).optional().nullable(),
  utrReference: z.string().max(100).optional().nullable(),
});

/**
 * POST /api/v1/orders/manual — free RSVP (auto-confirmed) or manual UPI order
 * (PENDING_VERIFICATION, organizer approves).
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const result = await runManualCheckout(user, parsed.data);
    if (result.error) return apiError(result.error, 400);
    return apiOk({ submitted: true });
  });
}
