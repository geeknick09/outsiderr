import { z } from "zod";

import { apiError, apiOk, readJson, withApi } from "@/modules/shared/server";
import { verifyScannerPinAction } from "@/modules/scanner/actions/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  pin: z.string().min(4).max(12),
});

/**
 * POST /api/v1/scanner/login — verify a scanner PIN for an event.
 * PIN-auth (no Bearer token) — the PIN is the door staff credential.
 * Rate-limited against brute force.
 */
export async function POST(request: Request) {
  return withApi(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const res = await verifyScannerPinAction(parsed.data.eventId, parsed.data.pin);
    if (!res.success) return apiError(res.error ?? "Invalid PIN.", res.code === "RATE_LIMITED" ? 429 : 401);
    return apiOk({ event: res.event });
  });
}
