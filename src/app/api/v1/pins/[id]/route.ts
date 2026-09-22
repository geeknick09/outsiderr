import { z } from "zod";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { revokeScannerPinAction } from "@/modules/organizer/actions/scanner-pins";
import { revokeBoxOfficePinAction } from "@/modules/organizer/actions/box-office-pins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(["scanner", "box-office"]),
});

/**
 * DELETE /api/v1/pins/[id] — revoke a PIN (body: { eventId, type }).
 * Auth: Bearer <supabase-access-token> (event owner)
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;
    const { eventId, type } = parsed.data;

    const res =
      type === "scanner"
        ? await revokeScannerPinAction(id, eventId)
        : await revokeBoxOfficePinAction(id, eventId);

    return res.success ? apiOk({ revoked: true }) : apiError(res.error ?? "Could not revoke PIN.", 400);
  });
}
