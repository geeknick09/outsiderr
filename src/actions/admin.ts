"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  adminDeleteEvent,
  adminUpdateEvent,
  adminUpdateEventStatus,
  adminToggleEventFeatured,
  adminToggleUserAdmin,
} from "@/lib/data/admin";
import { updateSlotPrice } from "@/lib/data/boosts";
import { approveBoost, rejectBoost } from "@/lib/data/boosts";
import { setClubVerified } from "@/lib/data/clubs";
import { approveOrder, rejectOrder } from "@/lib/data/orders";
import { createClient } from "@/lib/supabase/server";
import type { EventStatus } from "@/lib/types";

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

export async function adminDeleteEventAction(eventId: string): Promise<void> {
  await requireAdmin();
  await adminDeleteEvent(eventId);
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function adminUpdateEventStatusAction(
  eventId: string,
  status: EventStatus,
): Promise<void> {
  await requireAdmin();
  // If admin is cancelling an event, use the atomic cancel_event RPC
  // which processes refunds, cancels tickets, and sends notifications.
  if (status === "CANCELLED") {
    const supabase = await createClient();
    const { getCancellationChargePercent } = await import("@/lib/data/platform-settings");
    const cancellationChargePercent = await getCancellationChargePercent();
    const { error } = await supabase.rpc("cancel_event", {
      p_event_id: eventId,
      p_reason: "Event cancelled by admin.",
      p_cancellation_charge_percent: cancellationChargePercent,
    });
    if (error) throw new Error(error.message);
  } else {
    await adminUpdateEventStatus(eventId, status);
  }
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
}

export async function adminApproveOrderAction(orderId: string): Promise<void> {
  await requireAdmin();
  await approveOrder(orderId);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function adminRejectOrderAction(orderId: string, reason: string): Promise<void> {
  await requireAdmin();
  await rejectOrder(orderId, reason);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function adminApproveBoostAction(boostId: string): Promise<void> {
  await requireAdmin();
  await approveBoost(boostId);
  revalidatePath("/admin/boosts");
  revalidatePath("/");
}

export async function adminRejectBoostAction(boostId: string): Promise<void> {
  await requireAdmin();
  await rejectBoost(boostId);
  revalidatePath("/admin/boosts");
}

export async function adminToggleAdminAction(userId: string, isAdmin: boolean): Promise<void> {
  await requireAdmin();
  await adminToggleUserAdmin(userId, isAdmin);
  revalidatePath("/admin/users");
  revalidatePath("/");
}

export async function adminToggleFeaturedAction(eventId: string, featured: boolean): Promise<void> {
  await requireAdmin();
  await adminToggleEventFeatured(eventId, featured);
  revalidatePath("/admin/events");
  revalidatePath("/");
}

export async function adminUpdateEventAction(
  eventId: string,
  data: {
    title?: string;
    description?: string;
    category?: EventStatus extends never ? never : string;
    city?: string;
    venueName?: string;
    venueAddress?: string;
    startsAt?: string;
    endsAt?: string;
  },
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminUpdateEvent(eventId, data as any);
    revalidatePath("/admin/events");
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update event." };
  }
}

export async function adminUpdateSlotPriceAction(slot: number, pricePaise: number): Promise<void> {
  await requireAdmin();
  await updateSlotPrice(slot, pricePaise);
  revalidatePath("/admin/boosts");
  revalidatePath("/organizer/boost");
}

export async function adminUpdateEventFeesAction(
  eventId: string,
  data: {
    commissionBps?: number;
    commissionEnabled?: boolean;
    convenienceFeeBps?: number;
    convenienceFeeEnabled?: boolean;
  },
  reason?: string,
): Promise<{ error: string | null }> {
  try {
    const user = await requireAdmin();
    const supabase = await createClient();

    // Fetch current values for audit log
    const { data: current } = await supabase
      .from("events")
      .select("commission_bps, commission_enabled, convenience_fee_bps, convenience_fee_enabled")
      .eq("id", eventId)
      .maybeSingle();

    // Build update object
    const update: Record<string, number | boolean> = {};
    const auditEntries: { field: string; oldVal: string; newVal: string }[] = [];

    if (data.commissionBps !== undefined && data.commissionBps !== current?.commission_bps) {
      update.commission_bps = data.commissionBps;
      auditEntries.push({ field: "commission_bps", oldVal: String(current?.commission_bps ?? ""), newVal: String(data.commissionBps) });
    }
    if (data.commissionEnabled !== undefined && data.commissionEnabled !== current?.commission_enabled) {
      update.commission_enabled = data.commissionEnabled;
      auditEntries.push({ field: "commission_enabled", oldVal: String(current?.commission_enabled ?? ""), newVal: String(data.commissionEnabled) });
    }
    if (data.convenienceFeeBps !== undefined && data.convenienceFeeBps !== current?.convenience_fee_bps) {
      update.convenience_fee_bps = data.convenienceFeeBps;
      auditEntries.push({ field: "convenience_fee_bps", oldVal: String(current?.convenience_fee_bps ?? ""), newVal: String(data.convenienceFeeBps) });
    }
    if (data.convenienceFeeEnabled !== undefined && data.convenienceFeeEnabled !== current?.convenience_fee_enabled) {
      update.convenience_fee_enabled = data.convenienceFeeEnabled;
      auditEntries.push({ field: "convenience_fee_enabled", oldVal: String(current?.convenience_fee_enabled ?? ""), newVal: String(data.convenienceFeeEnabled) });
    }

    if (Object.keys(update).length === 0) {
      return { error: null };
    }

    // Update the event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("events").update(update as any).eq("id", eventId);
    if (error) throw error;

    // Insert audit log entries
    for (const entry of auditEntries) {
      await supabase.from("admin_change_log").insert({
        admin_id: user.id,
        table_name: "events",
        entity_id: eventId,
        field_name: entry.field,
        old_value: entry.oldVal,
        new_value: entry.newVal,
        reason: reason ?? null,
      });
    }

    revalidatePath("/admin/events");
    revalidatePath(`/events/${eventId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update fees." };
  }
}

export async function adminApproveClubAction(clubId: string): Promise<void> {
  await requireAdmin();
  await setClubVerified(clubId, true);
  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
}

export async function adminRejectClubAction(clubId: string): Promise<void> {
  await requireAdmin();
  await setClubVerified(clubId, false);
  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
}

// ============================================================================
// RAZORPAY: Admin refund + payout actions
// ============================================================================

/**
 * Initiate a refund for a confirmed order via Razorpay.
 * Creates a refund record and calls the Razorpay Refunds API.
 */
export async function adminInitiateRefundAction(
  orderId: string,
  amountPaise?: number,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  console.log(`[admin-refund] adminInitiateRefundAction: orderId=${orderId}, amountPaise=${amountPaise ?? "full"}, reason="${reason ?? "null"}"`);

  const { createClient } = await import("@/lib/supabase/server");
  const { getRazorpay, isRazorpayConfigured } = await import("@/lib/razorpay");

  if (!isRazorpayConfigured()) {
    console.warn("[admin-refund] Razorpay not configured");
    return { success: false, error: "Razorpay is not configured." };
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, event_id, user_id, total_paise, razorpay_payment_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    console.warn(`[admin-refund] Order not found: orderId=${orderId}`);
    return { success: false, error: "Order not found." };
  }
  if (order.status !== "CONFIRMED") {
    console.warn(`[admin-refund] Order not confirmed: orderId=${orderId}, status=${order.status}`);
    return { success: false, error: "Only confirmed orders can be refunded." };
  }
  if (!order.razorpay_payment_id) {
    console.warn(`[admin-refund] No Razorpay payment ID: orderId=${orderId}`);
    return { success: false, error: "No Razorpay payment id on this order." };
  }

  const refundAmount = amountPaise ?? order.total_paise;
  console.log(`[admin-refund] Refund amount: ${refundAmount}paise, order total: ${order.total_paise}paise`);

  // Guard: refund amount cannot exceed order total
  if (refundAmount > order.total_paise) {
    console.warn(`[admin-refund] Refund exceeds total: orderId=${orderId}, refundAmount=${refundAmount}, total=${order.total_paise}`);
    return { success: false, error: "Refund amount cannot exceed the order total." };
  }
  if (refundAmount <= 0) {
    console.warn(`[admin-refund] Refund amount not positive: orderId=${orderId}, refundAmount=${refundAmount}`);
    return { success: false, error: "Refund amount must be positive." };
  }

  // Guard: check for existing refunds to prevent over-refund
  const { data: existingRefunds } = await supabase
    .from("refunds")
    .select("amount_paise, status")
    .eq("order_id", orderId)
    .in("status", ["PENDING", "COMPLETED"]);

  const alreadyRefunded = (existingRefunds ?? []).reduce((s, r) => s + (r.amount_paise ?? 0), 0);
  if (alreadyRefunded + refundAmount > order.total_paise) {
    console.warn(`[admin-refund] Over-refund guard: orderId=${orderId}, alreadyRefunded=${alreadyRefunded}, requested=${refundAmount}, total=${order.total_paise}`);
    return {
      success: false,
      error: `Cannot refund ₹${(refundAmount / 100).toFixed(2)}. Already refunded ₹${(alreadyRefunded / 100).toFixed(2)} of ₹${(order.total_paise / 100).toFixed(2)}.`,
    };
  }

  const razorpay = getRazorpay();

  let razorpayRefundId: string;
  try {
    console.log(`[admin-refund] Calling Razorpay refund API: paymentId=${order.razorpay_payment_id}, amount=${refundAmount}paise`);
    const refund = await razorpay.payments.refund(order.razorpay_payment_id, {
      amount: refundAmount,
      notes: {
        order_id: orderId,
        reason: reason ?? "Admin initiated refund",
      },
    });
    razorpayRefundId = refund.id;
    console.log(`[admin-refund] Razorpay refund created: refundId=${razorpayRefundId}`);
  } catch (err) {
    console.error(`[admin-refund] Razorpay refund failed: orderId=${orderId}, error=`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Razorpay refund failed.",
    };
  }

  // Create refund record
  await supabase.from("refunds").insert({
    order_id: orderId,
    event_id: order.event_id,
    user_id: order.user_id,
    amount_paise: refundAmount,
    platform_fee_paise: 0,
    status: "PENDING",
    reason: reason ?? "Admin initiated refund",
    initiated_at: new Date().toISOString(),
    razorpay_payment_id: order.razorpay_payment_id,
    razorpay_refund_id: razorpayRefundId,
    refund_type: refundAmount === order.total_paise ? "FULL" : "PARTIAL",
  });

  // Update order status to REFUNDED (for full refunds)
  if (refundAmount === order.total_paise) {
    await supabase
      .from("orders")
      .update({ status: "REFUNDED" })
      .eq("id", orderId);
    // Void tickets
    await supabase
      .from("tickets")
      .update({ status: "CANCELLED" })
      .eq("order_id", orderId);
    console.log(`[admin-refund] Full refund: order marked REFUNDED, tickets CANCELLED, orderId=${orderId}`);
  } else {
    console.log(`[admin-refund] Partial refund: order stays CONFIRMED, orderId=${orderId}`);
  }

  // Insert payment_ledger REFUND entry
  try {
    await supabase.from("payment_ledger").insert({
      order_id: orderId,
      event_id: order.event_id,
      organizer_id: null,
      type: "REFUND",
      gross_amount_paise: -refundAmount,
      commission_paise: 0,
      convenience_fee_paise: 0,
      razorpay_fee_paise: 0,
      net_organizer_paise: 0,
      net_platform_paise: -refundAmount,
      razorpay_payment_id: `refund_${razorpayRefundId}`,
      notes: reason ?? "Admin initiated refund",
      created_at: new Date().toISOString(),
    });
  } catch (ledgerErr) {
    console.error(`[admin-refund] Ledger insert failed: orderId=${orderId}, error=`, ledgerErr);
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/payments");
  revalidatePath("/tickets");
  return { success: true };
}

/**
 * Record a manual payout to an organizer.
 * Admin enters the bank transfer reference after completing the NEFT/IMPS.
 */
export async function adminRecordPayoutAction(
  organizerId: string,
  amountPaise: number,
  bankReference: string,
  eventId?: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase.from("payout_records").insert({
    organizer_id: organizerId,
    event_id: eventId ?? null,
    amount_paise: amountPaise,
    status: "COMPLETED",
    bank_reference: bankReference,
    notes: notes ?? null,
    initiated_by: user.id,
    initiated_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Insert ledger entry
  await supabase.from("payment_ledger").insert({
    order_id: null,
    organizer_id: organizerId,
    event_id: eventId ?? null,
    type: "PAYOUT",
    gross_amount_paise: amountPaise,
    commission_paise: 0,
    convenience_fee_paise: 0,
    net_organizer_paise: amountPaise,
    net_platform_paise: 0,
    notes: `Payout: ${bankReference}${notes ? ` — ${notes}` : ""}`,
    created_at: new Date().toISOString(),
  });

  revalidatePath("/admin/payouts");
  revalidatePath("/organizer");
  return { success: true };
}

export async function updatePlatformSettingAction(
  key: string,
  value: string,
): Promise<{ error: string | null }> {
  const user = await requireAdmin();
  if (!key) return { error: "Setting key is required." };

  try {
    // Try to parse as JSON for object/number values, otherwise keep as string
    let parsedValue: string | number | boolean | Record<string, number>;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }

    const { updateSetting } = await import("@/lib/data/platform-settings");
    await updateSetting(user.id, key, parsedValue);
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidatePath("/organizer/boost");
    revalidatePath("/checkout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update setting." };
  }
}
