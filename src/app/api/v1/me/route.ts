import { withApiUser, apiOk } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Auth sanity check — returns the bearer token's user profile. */
export async function GET(request: Request) {
  return withApiUser(request, async (user) => apiOk({ user }));
}
