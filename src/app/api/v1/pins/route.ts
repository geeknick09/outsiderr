import { z } from "zod";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { generateScannerPinsAction } from "@/modules/organizer/actions/scanner-pins";
import { generateBoxOfficePinsAction } from "@/modules/organizer/actions/box-office-pins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(["scanner", "box-office"]),
  staffNames: z.array(z.string().min(1).max(100)).min(1).max(20),
  staffEmails: z.array(z.string().email()).optional(),
  staffPhones: z.array(z.string()).optional(),
  role: z.string().max(50).optional(),
});

/**
 * POST /api/v1/pins — generate scanner or box-office PINs for an event.
 * `{ type: "scanner" | "box-office", staffNames: [...] }`
 * Auth: Bearer <supabase-access-token> (event owner)
 */
export async function POST(request: Request) {
  return withApiUser(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;
    const { eventId, type, staffNames, staffEmails, staffPhones, role } = parsed.data;

    const res =
      type === "scanner"
        ? await generateScannerPinsAction(eventId, staffNames, staffEmails, staffPhones)
        : await generateBoxOfficePinsAction(eventId, staffNames, role);

    return res.success ? apiOk({ pins: res.pins }) : apiError(res.error ?? "Could not generate PINs.", 400);
  });
}
