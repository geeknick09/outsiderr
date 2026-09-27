import "server-only";

import { createClient } from "@/modules/shared/auth/server";
import { createServiceClient } from "@/modules/shared/auth/service";
import type { CurrentUser } from "@/modules/shared/auth/auth";
import type { RefundRow } from "@/modules/shared/db/database.types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RefundScope = "TICKET_PRICE" | "FULL" | "CUSTOM";

export interface Refund {
  id: string;
  orderId: string | null;
  eventId: string;
  userId: string;
  amountPaise: number;
  platformFeePaise: number;
  status: RefundRow["status"];
  reason: string;
  initiatedAt: string;
  completedAt: string | null;
  razorpayRefundId: string | null;
  razorpayPaymentId: string | null;
  refundScope: RefundScope | null;
  requestedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  claimedAt: string | null;
  attempts: number;
  lastError: string | null;
  receipt: string | null;
  intentId: string | null;
}

export function toRefund(row: RefundRow): Refund {
  return {
    id: row.id,
    orderId: row.order_id,
    eventId: row.event_id,
    userId: row.user_id,
    amountPaise: row.amount_paise,
    platformFeePaise: row.platform_fee_paise,
    status: row.status,
    reason: row.reason,
    initiatedAt: row.initiated_at,
    completedAt: row.completed_at,
    razorpayRefundId: row.razorpay_refund_id,
    razorpayPaymentId: row.razorpay_payment_id,
    refundScope: row.refund_scope,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedReason: row.rejected_reason,
    claimedAt: row.claimed_at,
    attempts: row.attempts,
    lastError: row.last_error,
    receipt: row.receipt,
    intentId: row.intent_id,
  };
}

// ─── User-facing ────────────────────────────────────────────────────────────

/** Refunds tied to the signed-in user's orders (RLS-scoped). */
export async function listMyRefunds(user: CurrentUser): Promise<Refund[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refunds")
    .select("*")
    .eq("user_id", user.id)
    .order("initiated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRefund);
}

/** Refunds for a set of orders (user ctx — RLS ensures visibility). */
export async function getRefundsForOrders(orderIds: string[]): Promise<Refund[]> {
  if (!orderIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refunds")
    .select("*")
    .in("order_id", orderIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRefund);
}

// ─── Organizer / admin transitions (user ctx — authz inside the RPC) ───────

export async function requestRefund(
  orderId: string,
  reason: string,
): Promise<Refund> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_refund", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || "Could not request refund.");
  return toRefund(data);
}

export async function approveRefund(
  refundId: string,
  scope: RefundScope,
  customAmountPaise?: number | null,
  note?: string | null,
): Promise<Refund> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_refund", {
    p_refund_id: refundId,
    p_scope: scope,
    p_custom_amount: customAmountPaise ?? null,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message || "Could not approve refund.");
  return toRefund(data);
}

export async function rejectRefund(
  refundId: string,
  reason?: string | null,
): Promise<Refund> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_refund", {
    p_refund_id: refundId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message || "Could not reject refund.");
  return toRefund(data);
}

export async function adminManualSettleRefund(
  refundId: string,
  reference: string,
): Promise<Refund> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_manual_settle_refund", {
    p_refund_id: refundId,
    p_reference: reference,
  });
  if (error) throw new Error(error.message || "Could not settle refund.");
  return toRefund(data);
}

// ─── Worker (service role) ──────────────────────────────────────────────────

export async function claimPendingRefunds(limit = 20): Promise<Refund[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("claim_pending_refunds", { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRefund);
}

export async function completeRefundInitiation(
  refundId: string,
  razorpayRefundId: string,
  ok: boolean,
  errorMessage?: string | null,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("complete_refund_initiation", {
    p_refund_id: refundId,
    p_razorpay_refund_id: razorpayRefundId,
    p_ok: ok,
    p_error: errorMessage ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function finalizeRefund(
  razorpayRefundId: string,
  status: string,
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("finalize_refund", {
    p_razorpay_refund_id: razorpayRefundId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
  return data ?? "UNKNOWN";
}

/** Admin reads — all refunds, newest first (service role). */
export async function listAllRefunds(limit = 200): Promise<Refund[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("refunds")
    .select("*")
    .order("initiated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRefund);
}
