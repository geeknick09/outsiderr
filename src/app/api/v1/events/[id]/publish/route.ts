import { revalidatePath, revalidateTag } from "next/cache";

import { apiError, apiOk, withApiUser } from "@/modules/shared/server";
import { updateEventStatus } from "@/modules/organizer/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/events/[id]/publish — publish a draft event.
 * Auth: Bearer <supabase-access-token> (event owner/staff)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async (user) => {
    try {
      await updateEventStatus(user, id, "PUBLISHED");
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not publish event.", 400);
    }
    revalidatePath("/");
    revalidateTag("events");
    revalidatePath(`/events/${id}`);
    return apiOk({ published: true });
  });
}
