import { z } from "zod";

import { apiError, apiOk, createClub, readJson, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(2).max(100),
  bio: z.string().max(2000).default(""),
  type: z.enum(["CLUB", "CREW"]).default("CLUB"),
  city: z.string().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  instagramHandle: z.string().max(100).optional().nullable(),
  upiId: z.string().max(100).optional().nullable(),
  membershipType: z.enum(["FREE", "PAID"]).default("FREE"),
  membershipFeePaise: z.number().int().min(0).default(0),
  terms: z.array(z.string()).default([]),
});

/**
 * POST /api/v1/clubs — create a club/crew.
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    try {
      const clubId = await createClub(user, {
        ...parsed.data,
        avatarUrl: parsed.data.avatarUrl ?? null,
        coverUrl: parsed.data.coverUrl ?? null,
        instagramHandle: parsed.data.instagramHandle ?? null,
        upiId: parsed.data.upiId ?? null,
        city: (parsed.data.city ?? null) as never,
      });
      return apiOk({ clubId });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not create club.", 400);
    }
  });
}
