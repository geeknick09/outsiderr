import { z } from "zod";

import { withApiUser, apiOk, apiError, createClient } from "@/modules/shared/server";

const paramsSchema = z.object({ id: z.string().uuid() });

/** POST /api/v1/communities/:id/follow - follow a community (member-event notifications). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (user) => {
    const { id } = paramsSchema.parse(await ctx.params);
    const supabase = await createClient();
    const { error } = await supabase
      .from("community_follows")
      .insert({ community_id: id, follower_id: user.id });
    if (error) {
      if (error.code === "23505") return apiOk({ following: true }); // already followed
      return apiError(error.message, 400);
    }
    return apiOk({ following: true });
  });
}

/** DELETE /api/v1/communities/:id/follow - unfollow. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (user) => {
    const { id } = paramsSchema.parse(await ctx.params);
    const supabase = await createClient();
    const { error } = await supabase
      .from("community_follows")
      .delete()
      .eq("community_id", id)
      .eq("follower_id", user.id);
    if (error) return apiError(error.message, 400);
    return apiOk({ following: false });
  });
}
