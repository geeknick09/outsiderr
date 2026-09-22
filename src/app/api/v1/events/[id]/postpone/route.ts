import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { postponeEvent } from "@/modules/organizer/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  reason: z.string().min(1, "A postponement reason is required.").max(1000),
});

/**
 * POST /api/v1/events/[id]/postpone — move an event to a new date (notifies
 * ticket holders + subscribers via the postpone_event RPC).
 * Auth: Bearer <supabase-access-token> (event owner)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const { startsAt, endsAt, reason } = parsed.data;
    if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return apiError("End date and time must be after the start date and time.", 400);
    }

    try {
      const result = await postponeEvent(user, id, startsAt, endsAt ?? null, reason);
      revalidatePath("/");
      revalidateTag("events");
      revalidatePath(`/events/${id}`);
      return apiOk(result);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not postpone event.", 400);
    }
  });
}
