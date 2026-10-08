import { getRazorpay } from "../lib/razorpay";
import { logger } from "../lib/logger";
import {
  claimPendingRefunds,
  completeRefundInitiation,
  finalizeRefund,
} from "../data/refunds";
import { applyCapturedPayment } from "../data/payments";
import { createServiceClient } from "../auth/service";

/**
 * Refund worker - claims PENDING refunds and initiates them against Razorpay.
 * Durable: claim → API call → completeRefundInitiation. On crash, the row
 * stays INITIATING until the 10-minute stale claim re-queues it.
 *
 * Legacy manual-UPI orders (no razorpay_payment_id) are skipped - admins
 * settle them via admin_manual_settle_refund.
 */
export async function processPendingRefunds(limit = 20): Promise<{
  claimed: number;
  initiated: number;
  failed: number;
  skipped: number;
}> {
  const refunds = await claimPendingRefunds(limit);
  let initiated = 0, failed = 0, skipped = 0;

  for (const refund of refunds) {
    try {
      const paymentId = await resolvePaymentId(refund.orderId, refund.razorpayPaymentId);
      if (!paymentId) {
        // Manual-UPI legacy row - leave INITIATING→PENDING for admin settle.
        await completeRefundInitiation(refund.id, "", false, "NO_RAZORPAY_PAYMENT");
        skipped++;
        continue;
      }
      const rz = await getRazorpay().payments.refund(paymentId, {
        amount: refund.amountPaise,
        receipt: refund.id,
        notes: { refund_id: refund.id, order_id: refund.orderId ?? "", reason: refund.reason.slice(0, 200) },
      });
      await completeRefundInitiation(refund.id, rz.id, true);
      initiated++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn({ refundId: refund.id, err: msg }, "refund initiation failed");
      try {
        await completeRefundInitiation(refund.id, "", false, msg.slice(0, 500));
      } catch {
        // last-resort: the stale claim re-queues it
      }
      failed++;
    }
  }

  return { claimed: refunds.length, initiated, failed, skipped };
}

async function resolvePaymentId(orderId: string | null, razorpayPaymentId: string | null): Promise<string | null> {
  if (razorpayPaymentId) return razorpayPaymentId;
  if (!orderId) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select("razorpay_payment_id")
    .eq("id", orderId)
    .maybeSingle();
  return data?.razorpay_payment_id ?? null;
}

/**
 * Payment reconciliation - catches captures the webhook + client callback
 * both missed (user closed the tab, webhook delivery dropped). For every
 * CREATED intent with a razorpay_order_id, fetch the gateway payments and
 * apply a captured one if found.
 */
export async function reconcilePayments(): Promise<{ checked: number; recovered: number }> {
  const supabase = createServiceClient();
  const { data: intents } = await supabase
    .from("payment_intents")
    .select("id, razorpay_order_id, razorpay_payment_id")
    .eq("status", "CREATED")
    .not("razorpay_order_id", "is", null)
    .lt("expires_at", new Date().toISOString());
  let recovered = 0;
  for (const intent of intents ?? []) {
    try {
      const payments = await getRazorpay().orders.fetchPayments(intent.razorpay_order_id!);
      const captured = (payments.items ?? []).find(
        (p: { status?: string }) => p.status === "captured",
      );
      if (!captured) continue;
      await applyCapturedPayment({
        razorpayOrderId: intent.razorpay_order_id!,
        razorpayPaymentId: captured.id,
        amountPaise: captured.amount as number,
        currency: (captured.currency as string) ?? "INR",
        method: (captured.method as string) ?? null,
        feePaise: (captured.fee as number) ?? null,
        taxPaise: (captured.tax as number) ?? null,
      });
      recovered++;
      logger.info({ intentId: intent.id }, "recovered captured payment via reconcile");
    } catch (error) {
      logger.warn({ intentId: intent.id, err: String(error) }, "reconcile check failed");
    }
  }
  return { checked: (intents ?? []).length, recovered };
}

/**
 * Refund reconciliation - polls Razorpay for the final state of INITIATED
 * refunds the webhook never told us about.
 */
export async function reconcileRefunds(): Promise<{ checked: number; finalized: number }> {
  const supabase = createServiceClient();
  const { data: refunds } = await supabase
    .from("refunds")
    .select("id, razorpay_refund_id, razorpay_payment_id, order_id")
    .in("status", ["INITIATED", "INITIATING"])
    .not("razorpay_refund_id", "is", null);
  let finalized = 0;
  for (const refund of refunds ?? []) {
    try {
      const paymentId = await resolvePaymentId(refund.order_id, refund.razorpay_payment_id);
      if (!paymentId) continue;
      const rz = await getRazorpay().payments.fetchRefund(paymentId, refund.razorpay_refund_id!);
      const status = (rz as { status?: string }).status;
      if (status === "processed" || status === "failed") {
        await finalizeRefund(refund.razorpay_refund_id!, status);
        finalized++;
      }
    } catch (error) {
      logger.warn({ refundId: refund.id, err: String(error) }, "refund reconcile failed");
    }
  }
  return { checked: (refunds ?? []).length, finalized };
}
