import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { cancelEvent } from "@/modules/organizer/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().min(1, "A cancellation reason is required.").max(1000),
  cancellationChargePercent: z.number().min(0).max(100).default(0),
});

/**
 * POST /api/v1/events/[id]/cancel — cancel an event (refunds + notifications
 * are handled by the cancel_event RPC).
 * Auth: Bearer <supabase-access-token> (event owner)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    try {
      const result = await cancelEvent(user, id, parsed.data.reason);
      revalidatePath("/");
      revalidateTag("events");
      revalidatePath(`/events/${id}`);
      return apiOk(result);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not cancel event.", 400);
    }
  });
}
