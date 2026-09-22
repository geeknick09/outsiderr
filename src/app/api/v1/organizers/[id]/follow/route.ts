import { apiError, apiOk, withApiUser } from "@/modules/shared/server";
import { followOrganizerAction, unfollowOrganizerAction } from "@/modules/shared/actions/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/organizers/[id]/follow */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async () => {
    const res = await followOrganizerAction(id);
    return res.error ? apiError(res.error, 400) : apiOk({ following: true });
  });
}

/** DELETE /api/v1/organizers/[id]/follow */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async () => {
    const res = await unfollowOrganizerAction(id);
    return res.error ? apiError(res.error, 400) : apiOk({ following: false });
  });
}
