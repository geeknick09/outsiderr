import { apiError, apiOk, withApiUser } from "@/modules/shared/server";
import { subscribeToEventAction, unsubscribeFromEventAction } from "@/modules/shared/actions/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/events/[id]/subscribe — "Update Me" subscription. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async () => {
    const res = await subscribeToEventAction(id);
    return res.error ? apiError(res.error, 400) : apiOk({ subscribed: true });
  });
}

/** DELETE /api/v1/events/[id]/subscribe */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async () => {
    const res = await unsubscribeFromEventAction(id);
    return res.error ? apiError(res.error, 400) : apiOk({ subscribed: false });
  });
}
