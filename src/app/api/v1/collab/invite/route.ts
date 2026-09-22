import { z } from "zod";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { inviteCollaboratorAction } from "@/modules/shared/actions/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  organizerId: z.string().uuid(),
  permissionLevel: z.enum(["VIEW_ONLY", "ANALYTICS", "SCAN", "FULL"]).default("VIEW_ONLY"),
});

/**
 * POST /api/v1/collab/invite — invite another organizer as a collaborator
 * (event owner only).
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const res = await inviteCollaboratorAction(
      parsed.data.eventId,
      parsed.data.organizerId,
      parsed.data.permissionLevel,
    );
    return res.error ? apiError(res.error, 400) : apiOk({ invited: true });
  });
}
