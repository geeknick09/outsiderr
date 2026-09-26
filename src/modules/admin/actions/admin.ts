"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { getCurrentUser } from "@/modules/shared/server";
import { auditEventAction, auditFinancialAction, auditLog } from "@/modules/shared/server";
import { logger } from "@/modules/shared/server";
import { adminDeleteEvent, adminUpdateEvent, adminUpdateEventStatus, adminToggleEventFeatured, adminToggleUserAdmin } from "../data/admin";
import { updateSlotPrice } from "@/modules/shared/server";
import { approveBoost, rejectBoost } from "@/modules/shared/server";
import { setClubVerified } from "@/modules/shared/server";
import { approveOrder, rejectOrder } from "@/modules/shared/server";
import { createClient, createServiceClient } from "@/modules/shared/server";
import { isEventReadOnly } from "@/modules/shared";
import type { EventStatus } from "@/modules/shared";

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
  const user = await requireAdmin();
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("starts_at").eq("id", eventId).maybeSingle();
  if (event && isEventReadOnly(event.starts_at)) {
    throw new Error("This event has already started and cannot be deleted.");
  }
  await adminDeleteEvent(eventId);
  await auditEventAction(user.id, "DELETE_EVENT", eventId);
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidateTag("events");
}

export async function adminUpdateEventStatusAction(
  eventId: string,
  status: EventStatus,
): Promise<void> {
  const user = await requireAdmin();
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("starts_at").eq("id", eventId).maybeSingle();
  if (event && isEventReadOnly(event.starts_at)) {
    throw new Error("This event has already started and is now read-only for admins.");
  }
  // If admin is cancelling an event, use the atomic cancel_event RPC
  // which processes refunds, cancels tickets, and sends notifications.
  if (status === "CANCELLED") {
    const { getCancellationChargePercent } = await import("@/modules/shared/server");
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
  await auditEventAction(user.id, `STATUS_${status}`, eventId);
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
  revalidateTag("events");
}

export async function adminApproveOrderAction(orderId: string): Promise<void> {
  const user = await requireAdmin();
  await approveOrder(orderId);
  await auditFinancialAction(user.id, "APPROVE_ORDER", orderId);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function adminRejectOrderAction(orderId: string, reason: string): Promise<void> {
  const user = await requireAdmin();
  await rejectOrder(orderId, reason);
  await auditFinancialAction(user.id, "REJECT_ORDER", orderId, { reason });
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
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("starts_at").eq("id", eventId).maybeSingle();
  if (event && isEventReadOnly(event.starts_at)) {
    throw new Error("This event is live and cannot be featured or unfeatured.");
  }
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
    const user = await requireAdmin();
    const supabase = await createClient();
    const { data: event } = await supabase.from("events").select("starts_at").eq("id", eventId).maybeSingle();
    if (event && isEventReadOnly(event.starts_at)) {
      return { error: "This event has already started and is locked in read-only mode." };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminUpdateEvent(eventId, data as any);
    await auditEventAction(user.id, "ADMIN_UPDATE_EVENT", eventId, data);
    revalidatePath("/admin/events");
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/");
    revalidateTag("events");
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

    // Fetch current values for audit log + lock-out check
    const { data: current } = await supabase
      .from("events")
      .select("commission_bps, commission_enabled, convenience_fee_bps, convenience_fee_enabled, starts_at")
      .eq("id", eventId)
      .maybeSingle();

    // Lock fees once the event has started/completed — view-only from then on.
    if (current?.starts_at && new Date(current.starts_at).getTime() <= Date.now()) {
      return { error: "Event has already started — fees are locked." };
    }

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
  const user = await requireAdmin();

  logger.info({ orderId, amountPaise, reason }, "admin refund initiated");

  const { createClient } = await import("@/modules/shared/server");
  const { getRazorpay, isRazorpayConfigured } = await import("@/modules/shared/server");

  if (!isRazorpayConfigured()) {
    logger.warn("admin refund: Razorpay not configured");
    return { success: false, error: "Razorpay is not configured." };
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, event_id, user_id, total_paise, razorpay_payment_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    logger.warn({ orderId }, "admin refund: order not found");
    return { success: false, error: "Order not found." };
  }
  if (order.status !== "CONFIRMED") {
    logger.warn({ orderId, status: order.status }, "admin refund: order not confirmed");
    return { success: false, error: "Only confirmed orders can be refunded." };
  }
  if (!order.razorpay_payment_id) {
    logger.warn({ orderId }, "admin refund: no razorpay payment id");
    return { success: false, error: "No Razorpay payment id on this order." };
  }

  const refundAmount = amountPaise ?? order.total_paise;

  // Guard: refund amount cannot exceed order total
  if (refundAmount > order.total_paise) {
    logger.warn({ orderId, refundAmount, total: order.total_paise }, "admin refund: exceeds total");
    return { success: false, error: "Refund amount cannot exceed the order total." };
  }
  if (refundAmount <= 0) {
    logger.warn({ orderId, refundAmount }, "admin refund: amount not positive");
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
    logger.warn({ orderId, alreadyRefunded, requested: refundAmount, total: order.total_paise }, "admin refund: over-refund guard");
    return {
      success: false,
      error: `Cannot refund ₹${(refundAmount / 100).toFixed(2)}. Already refunded ₹${(alreadyRefunded / 100).toFixed(2)} of ₹${(order.total_paise / 100).toFixed(2)}.`,
    };
  }

  const razorpay = getRazorpay();

  let razorpayRefundId: string;
  try {
    logger.info({ paymentId: order.razorpay_payment_id, amount: refundAmount }, "calling Razorpay refund API");
    const refund = await razorpay.payments.refund(order.razorpay_payment_id, {
      amount: refundAmount,
      notes: {
        order_id: orderId,
        reason: reason ?? "Admin initiated refund",
      },
    });
    razorpayRefundId = refund.id;
    logger.info({ refundId: razorpayRefundId }, "Razorpay refund created");
  } catch (err) {
    logger.error({ orderId, error: err instanceof Error ? err.message : String(err) }, "Razorpay refund failed");
    return {
      success: false,
      error: err instanceof Error ? err.message : "Razorpay refund failed.",
    };
  }

  // Create refund record — service client: refunds insert policy is
  // owner-only + the ledger has no user insert policy at all.
  const service = createServiceClient();
  const { error: refundInsertError } = await service.from("refunds").insert({
    order_id: orderId,
    event_id: order.event_id,
    user_id: order.user_id,
    amount_paise: refundAmount,
    platform_fee_paise: 0,
    status: "INITIATED",
    reason: reason ?? "Admin initiated refund",
    initiated_at: new Date().toISOString(),
    initiated_by: user.id,
    razorpay_payment_id: order.razorpay_payment_id,
    razorpay_refund_id: razorpayRefundId,
    refund_type: refundAmount === order.total_paise ? "FULL" : "PARTIAL",
  });
  if (refundInsertError) {
    logger.error({ orderId, error: refundInsertError.message }, "refund record insert failed — Razorpay already moved money, reconcile manually");
  }

  // Update order status to REFUNDED (for full refunds)
  if (refundAmount === order.total_paise) {
    await service
      .from("orders")
      .update({ status: "REFUNDED" })
      .eq("id", orderId);
    // Void tickets
    await service
      .from("tickets")
      .update({ status: "CANCELLED" })
      .eq("order_id", orderId);
    logger.info({ orderId }, "full refund: order REFUNDED, tickets CANCELLED");
  } else {
    logger.info({ orderId }, "partial refund: order stays CONFIRMED");
  }

  // Insert payment_ledger REFUND entry
  try {
    await service.from("payment_ledger").insert({
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
    logger.error({ orderId, error: ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr) }, "refund ledger insert failed");
  }

  await auditFinancialAction(user.id, "INITIATE_REFUND", orderId, {
    amountPaise: refundAmount,
    razorpayRefundId,
    reason,
  });

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
  const user = await requireAdmin();

  const { createClient } = await import("@/modules/shared/server");
  const supabase = await createClient();

  const { error } = await createServiceClient().from("payout_records").insert({
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

  // Insert ledger entry — service client (no user insert policy on payment_ledger)
  await createServiceClient().from("payment_ledger").insert({
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

  await auditFinancialAction(user.id, "RECORD_PAYOUT", organizerId, {
    amountPaise,
    bankReference,
    eventId,
  });

  revalidatePath("/admin/payouts");
  revalidatePath("/organizer");
  return { success: true };
}

// Numeric settings with a floor — mirrors the `min` attributes in
// AdminSettingsPanel but enforced server-side (client input is bypassable).
const SETTING_MINIMUMS: Record<string, number> = {
  commission_tier1_max_paise: 0,
  commission_tier2_max_paise: 0,
  commission_tier1_bps: 0,
  commission_tier2_bps: 0,
  commission_tier3_bps: 0,
  cancellation_charge_percent: 0,
  postponement_charge_percent: 0,
  max_tickets_per_order: 1,
  venue_announcement_deadline_hours: 0,
  max_popular_per_city: 1,
  max_sponsored_per_city: 1,
  organizer_rejection_limit: 1,
  draft_retention_days: 1,
  default_commission_bps: 0,
  default_convenience_fee_bps: 0,
};

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

    const min = SETTING_MINIMUMS[key];
    if (min !== undefined) {
      if (typeof parsedValue !== "number" || !Number.isFinite(parsedValue)) {
        return { error: "This setting requires a number." };
      }
      if (parsedValue < min) {
        return { error: `Minimum allowed value is ${min}.` };
      }
    }

    const { updateSetting } = await import("@/modules/shared/server");
    const { data: existing } = await (await import("@/modules/shared/server")).createClient()
      .then((s) => s.from("platform_settings").select("value").eq("key", key).maybeSingle());
    await updateSetting(user.id, key, parsedValue);
    await auditLog({
      adminId: user.id,
      tableName: "platform_settings",
      entityId: key,
      fieldName: key,
      oldValue: existing?.value != null ? JSON.stringify(existing.value) : null,
      newValue: value,
    });
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidatePath("/organizer/boost");
    revalidatePath("/checkout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update setting." };
  }
}
