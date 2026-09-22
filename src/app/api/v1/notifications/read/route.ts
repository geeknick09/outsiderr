import { z } from "zod";

import { apiError, apiOk, markAllNotificationsRead, markNotificationRead, readJson, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  notificationId: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

/**
 * POST /api/v1/notifications/read — mark one notification read, or all with
 * `{ "all": true }`.
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const { notificationId, all } = parsed.data;
    if (!notificationId && !all) {
      return apiError("Provide notificationId or { all: true }.", 400);
    }

    try {
      if (all) await markAllNotificationsRead(user);
      else await markNotificationRead(user, notificationId!);
      return apiOk({ read: true });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not update notification.", 400);
    }
  });
}
