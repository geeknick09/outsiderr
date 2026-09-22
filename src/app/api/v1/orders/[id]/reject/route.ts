import { z } from "zod";
import { revalidatePath } from "next/cache";

import { apiError, apiOk, readJson, rejectOrder, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().max(500).default(""),
});

/**
 * POST /api/v1/orders/[id]/reject — reject a manual-UPI order (auto-offers the
 * freed ticket to the waitlist).
 * Auth: Bearer <supabase-access-token> (event staff)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async () => {
    const parsed = await readJson(request, bodySchema.partial());
    if ("response" in parsed) return parsed.response;

    try {
      await rejectOrder(id, parsed.data.reason ?? "");
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not reject order.", 400);
    }
    revalidatePath("/organizer");
    return apiOk({ rejected: true });
  });
}
