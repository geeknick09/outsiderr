import { z } from "zod";

import { apiError, apiOk, readJson, withApi } from "@/modules/shared/server";
import { verifyBoxOfficePinAction } from "@/modules/scanner/actions/box-office";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  pin: z.string().min(4).max(12),
});

/**
 * POST /api/v1/box-office/login — verify a box-office PIN for an event.
 * PIN-auth (no Bearer token) — rate-limited against brute force.
 */
export async function POST(request: Request) {
  return withApi(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const res = await verifyBoxOfficePinAction(parsed.data.eventId, parsed.data.pin);
    if (!res.success) return apiError(res.error ?? "Invalid PIN.", res.code === "RATE_LIMITED" ? 429 : 401);
    return apiOk({ event: res.event });
  });
}
