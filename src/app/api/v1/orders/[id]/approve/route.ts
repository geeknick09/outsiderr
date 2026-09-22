import { revalidatePath } from "next/cache";

import { apiError, apiOk, approveOrder, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/orders/[id]/approve — approve a manual-UPI order (mints tickets).
 * Auth: Bearer <supabase-access-token> (event staff)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiUser(request, async () => {
    try {
      await approveOrder(id);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not approve order.", 400);
    }
    revalidatePath("/organizer");
    return apiOk({ approved: true });
  });
}
