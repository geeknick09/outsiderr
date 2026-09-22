import { z } from "zod";

import { apiError, apiOk, readJson, updateUserProfile, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fullName: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  birthDate: z.string().optional().nullable(),
  gender: z.string().max(50).optional().nullable(),
  interestedTags: z.array(z.string().max(100)).max(50).optional(),
  instagramUrl: z.string().url().max(500).optional().nullable(),
  youtubeUrl: z.string().url().max(500).optional().nullable(),
  xUrl: z.string().url().max(500).optional().nullable(),
  facebookUrl: z.string().url().max(500).optional().nullable(),
  linkedinUrl: z.string().url().max(500).optional().nullable(),
  avatarUrl: z.string().url().max(500).optional().nullable(),
});

/**
 * PATCH /api/v1/profile — update the current user's profile.
 * Auth: Bearer <supabase-access-token>
 */
export async function PATCH(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;

    try {
      await updateUserProfile(user, parsed.data);
      return apiOk({ updated: true });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not update profile.", 400);
    }
  });
}
