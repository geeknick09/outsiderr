import { z } from "zod";

import { apiOk, readJson, withApi } from "@/modules/shared/server";
import { checkInTicketAction } from "@/modules/scanner/actions/check-in";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  qrHash: z.string().min(16).max(128),
  eventId: z.string().uuid(),
  pin: z.string().min(4).max(12),
});

/**
 * POST /api/v1/scanner/check-in — scan + check in a ticket (PIN-auth).
 * Returns the ScanResult { outcome, message, ticket } — outcome is the
 * source of truth (VALID/USED/INVALID/WRONG_EVENT/...), HTTP stays 200.
 */
export async function POST(request: Request) {
  return withApi(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    const result = await checkInTicketAction(parsed.data.qrHash, parsed.data.eventId, parsed.data.pin);
    return apiOk(result);
  });
}
