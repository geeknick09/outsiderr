import { z } from "zod";

import { apiError, apiOk, joinClub, readJson, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  instagramLink: z.string().max(500).optional(),
  utrReference: z.string().max(100).optional(),
});

/**
 * POST /api/v1/clubs/[id]/join — join a club (PAID clubs create a pending
 * membership awaiting organizer approval; FREE joins instantly).
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema.partial());
    if ("response" in parsed) return parsed.response;

    try {
      await joinClub(user, id, parsed.data);
      return apiOk({ joined: true });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not join club.", 400);
    }
  });
}
