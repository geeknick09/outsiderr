import { z } from "zod";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { acceptCollaborationAction, rejectCollaborationAction } from "@/modules/shared/actions/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  collaboratorId: z.string().uuid(),
  accept: z.boolean(),
});

/**
 * POST /api/v1/collab/respond — accept or reject a collaboration invite.
 * `{ accept: true }` accepts, `{ accept: false }` rejects.
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const { eventId, collaboratorId, accept } = parsed.data;
    const res = accept
      ? await acceptCollaborationAction(eventId, collaboratorId)
      : await rejectCollaborationAction(eventId, collaboratorId);
    return res.error ? apiError(res.error, 400) : apiOk({ accepted: accept });
  });
}
