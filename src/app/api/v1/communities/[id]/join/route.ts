import { z } from "zod";

import { apiError, apiOk, joinCommunity, readJson, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  inviteToken: z.string().max(100).optional(),
  refCode: z.string().max(32).optional(),
  answers: z.array(z.object({ questionId: z.string().uuid(), answer: z.string().max(1000) })).optional(),
});

/**
 * POST /api/v1/communities/[id]/join - join a community (PAID communities create a pending
 * membership awaiting organizer approval; FREE joins instantly).
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema.partial());
    if ("response" in parsed) return parsed.response;

    try {
      const result = await joinCommunity(user, id, {
        answers: parsed.data.answers,
        inviteToken: parsed.data.inviteToken ?? null,
        refCode: parsed.data.refCode ?? null,
      });
      return apiOk({ joined: true, memberId: result.memberId, status: result.status });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not join community.", 400);
    }
  });
}
