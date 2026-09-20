"use server";

import { revalidatePath } from "next/cache";
import { approveOrder, rejectOrder } from "@/modules/shared/server";

// ============================================================================
// LEGACY: approve/reject actions — kept for historical PENDING_VERIFICATION orders.
// ============================================================================

export async function approveOrderAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  console.log(`[order] approveOrderAction: orderId=${orderId}`);
  try {
    await approveOrder(orderId);
    console.log(`[order] approveOrderAction success: orderId=${orderId}`);
  } catch (err) {
    console.error(`[order] approveOrderAction error: orderId=${orderId}, error=`, err);
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to approve order.";
    throw new Error(message);
  }
  revalidatePath("/organizer");
  revalidatePath("/tickets");
}

export async function rejectOrderAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  console.log(`[order] rejectOrderAction: orderId=${orderId}, reason="${reason}"`);
  try {
    await rejectOrder(orderId, reason);
    console.log(`[order] rejectOrderAction success: orderId=${orderId}`);
  } catch (err) {
    console.error(`[order] rejectOrderAction error: orderId=${orderId}, error=`, err);
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to reject order.";
    throw new Error(message);
  }
  revalidatePath("/organizer");
  revalidatePath("/tickets");
}
