"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/modules/shared/server";
import { requestRefund } from "@/modules/shared/server";

/** Organizer: request a refund on a CONFIRMED order → admin review queue. */
export async function requestOrderRefundAction(
  orderId: string,
  reason: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to continue." };
  if (!orderId) return { error: "Missing order." };

  try {
    await requestRefund(orderId, reason);
    revalidatePath("/organizer");
    revalidatePath("/organizer/refunds");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not request refund." };
  }
}