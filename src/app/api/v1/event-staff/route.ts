import { z } from "zod";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { addEventStaffAction, removeEventStaffAction } from "@/modules/organizer/actions/event-staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addSchema = z.object({
  eventId: z.string().uuid(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  displayName: z.string().min(1).max(100),
});

const removeSchema = z.object({
  eventId: z.string().uuid(),
  staffId: z.string().uuid(),
});

/**
 * POST /api/v1/event-staff — add a staff member to an event.
 * Auth: Bearer <supabase-access-token> (event owner)
 */
export async function POST(request: Request) {
  return withApiUser(request, async () => {
    const parsed = await readJson(request, addSchema);
    if ("response" in parsed) return parsed.response;
    const { eventId, email, phone, displayName } = parsed.data;

    const res = await addEventStaffAction(eventId, email ?? "", phone ?? "", displayName);
    return res.success ? apiOk({ added: true }) : apiError(res.error ?? "Could not add staff.", 400);
  });
}

/** DELETE /api/v1/event-staff — remove a staff member (body: { eventId, staffId }). */
export async function DELETE(request: Request) {
  return withApiUser(request, async () => {
    const parsed = await readJson(request, removeSchema);
    if ("response" in parsed) return parsed.response;

    const res = await removeEventStaffAction(parsed.data.eventId, parsed.data.staffId);
    return res.success ? apiOk({ removed: true }) : apiError(res.error ?? "Could not remove staff.", 400);
  });
}
