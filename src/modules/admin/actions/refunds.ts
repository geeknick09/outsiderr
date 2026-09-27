"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, createClient } from "@/modules/shared/server";
import {
  approveRefund,
  rejectRefund,
  adminManualSettleRefund,
  requestRefund,
} from "@/modules/shared/server";
import type { RefundScope } from "@/modules/shared/server";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_admin === true) return user;
  throw new Error("Not authorised.");
}

/** Admin: approve a refund request → PENDING (worker pushes to Razorpay). */
export async function adminApproveRefundAction(
  refundId: string,
  scope: RefundScope,
  customAmountPaise?: number | null,
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await approveRefund(refundId, scope, customAmountPaise ?? null, null);
    revalidatePath("/admin/refunds");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not approve refund." };
  }
}

/** Admin: reject a refund request — order returns to CONFIRMED. */
export async function adminRejectRefundAction(
  refundId: string,
  reason?: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await rejectRefund(refundId, reason ?? null);
    revalidatePath("/admin/refunds");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reject refund." };
  }
}

/** Admin: create a refund directly on an order (no prior request needed). */
export async function adminRequestRefundAction(
  orderId: string,
  reason: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await requestRefund(orderId, reason);
    revalidatePath("/admin/refunds");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create refund." };
  }
}

/** Admin: mark a refund settled off-gateway (manual UPI/cash settlement). */
export async function adminManualSettleAction(
  refundId: string,
  reference: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await adminManualSettleRefund(refundId, reference);
    revalidatePath("/admin/refunds");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not settle refund." };
  }
}

/** Admin: run the refund worker inline (for stuck/slow refunds). */
export async function adminProcessRefundsNowAction(): Promise<{
  claimed?: number;
  initiated?: number;
  failed?: number;
  skipped?: number;
  error?: string;
}> {
  await requireAdmin();
  try {
    const { processPendingRefunds } = await import("@/modules/shared/services/refunds");
    const result = await processPendingRefunds(20);
    revalidatePath("/admin/refunds");
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Worker run failed." };
  }
}