"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, checkInTicket, checkInTicketWithPin } from "@/modules/shared/server";
import { validate, checkInWithPinSchema, boxOfficeOrderSchema, rateLimit, getRateLimitIdentifier, RATE_LIMITS } from "@/modules/shared";
import type { ScanResult } from "@/modules/shared";

export async function checkInTicketAction(qrHash: string, eventId: string, pin?: string): Promise<ScanResult> {
  const v = validate(checkInWithPinSchema, { qrHash, eventId, pin: pin ?? "" });
  if (!v.success) {
    return { outcome: "INVALID", message: v.error };
  }
  // Rate limit check-in to prevent abuse (legitimate scanning is high-volume)
  const { headers } = await import("next/headers");
  const h = await headers();
  const identifier = `check-in:${getRateLimitIdentifier(h)}`;
  const rl = rateLimit(identifier, RATE_LIMITS.CHECK_IN);
  if (rl.limited) {
    return { outcome: "INVALID", message: "Too many scans. Please slow down." };
  }
  console.log(`[check-in] checkInTicketAction: eventId=${v.data.eventId}, qrHash=${v.data.qrHash.slice(0, 16)}..., pin=${pin ? "yes" : "no"}`);
  try {
    const result = pin
      ? await checkInTicketWithPin(v.data.qrHash, v.data.eventId, v.data.pin)
      : await checkInTicket(v.data.qrHash, v.data.eventId);
    console.log(`[check-in] Result: outcome=${result.outcome}, message="${result.message}", holder=${result.ticket?.holderName ?? "null"}, tier=${result.ticket?.tierName ?? "null"}`);
    return result;
  } catch (error) {
    console.error(`[check-in] checkInTicketAction error: eventId=${v.data.eventId}, qrHash=${v.data.qrHash.slice(0, 16)}..., error=`, error);
    return {
      outcome: "INVALID",
      message: error instanceof Error ? error.message : "Scan failed.",
    };
  }
}

// ============================================================================
// WALK-IN / MANUAL CHECK-IN — organizer adds a walk-in attendee.
// p_mode: 'WALKIN_PREEVENT' (before event, mints VALID ticket + PDF)
//         'WALKIN_QR'       (during event, mints VALID ticket for scanning)
//         'WALKIN_INSTANT'  (during event, auto check-in, ticket = USED)
// Convenience fee is always 0 for walk-ins. Commission is still deducted.
// ============================================================================

export interface WalkinResult {
  error: string | null;
  success: boolean;
  ticketId?: string;
  orderId?: string;
}

export async function createWalkinOrderAction(formData: FormData): Promise<WalkinResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to continue.", success: false };

  const eventId = String(formData.get("eventId") ?? "");
  const tierId = String(formData.get("tierId") ?? "") || null;
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim();
  const buyerEmail = String(formData.get("buyerEmail") ?? "").trim() || null;
  const amountRupees = Number(formData.get("amount") ?? 0);
  const amountPaise = Math.round(amountRupees * 100);
  const mode = String(formData.get("mode") ?? "WALKIN_PREEVENT");

  const v = validate(boxOfficeOrderSchema, {
    eventId,
    pin: "000000", // walkin action doesn't use PIN, but schema requires it
    tierId,
    buyerName,
    buyerPhone,
    buyerEmail,
    amountPaise,
    mode,
  });
  if (!v.success) return { error: v.error, success: false };
  const { eventId: validEventId, tierId: validTierId, buyerName: validName, buyerPhone: validPhone, buyerEmail: validEmail, amountPaise: validAmount, mode: validMode } = v.data;

  // Verify organizer owns this event
  const { getOrganizerProfile } = await import("@/modules/shared/server");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "No organizer profile.", success: false };

  const { createClient, createServiceClient } = await import("@/modules/shared/server");
  const supabase = await createClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("id")
    .eq("id", validEventId)
    .eq("organizer_id", organizer.id)
    .maybeSingle();
  if (!eventRow) return { error: "Event not found or not owned by you.", success: false };

  // create_walkin_order is service-role only — ownership verified above.
  const { data: result, error } = await createServiceClient().rpc("create_walkin_order", {
    p_event_id: validEventId,
    p_buyer_name: validName,
    p_buyer_phone: validPhone,
    p_tier_id: validTierId,
    p_buyer_email: validEmail,
    p_amount_paise: validAmount,
    p_mode: validMode,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) return { error: error.message, success: false };

  const walkinResult = (result ?? {}) as { ticketId?: string; orderId?: string };
  revalidatePath(`/organizer/events/${validEventId}`);
  return {
    error: null,
    success: true,
    ticketId: walkinResult.ticketId,
    orderId: walkinResult.orderId,
  };
}

export async function updateWalkinOrderAction(formData: FormData): Promise<{ error: string | null; success: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to continue.", success: false };

  const orderId = String(formData.get("orderId") ?? "");
  const buyerName = String(formData.get("buyerName") ?? "").trim() || null;
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim() || null;
  const buyerEmail = String(formData.get("buyerEmail") ?? "").trim() || null;
  const amountRupees = Number(formData.get("amount") ?? 0);
  const amountPaise = amountRupees > 0 ? Math.round(amountRupees * 100) : null;

  if (!orderId) return { error: "Missing order ID.", success: false };

  // Verify organizer owns the event this order belongs to
  const { getOrganizerProfile } = await import("@/modules/shared/server");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "No organizer profile.", success: false };

  const { createClient, createServiceClient } = await import("@/modules/shared/server");
  const supabase = await createClient();
  const { data: orderRow } = await supabase
    .from("orders")
    .select("event_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!orderRow) return { error: "Order not found.", success: false };

  const { data: eventRow } = await supabase
    .from("events")
    .select("id")
    .eq("id", orderRow.event_id)
    .eq("organizer_id", organizer.id)
    .maybeSingle();
  if (!eventRow) return { error: "Not authorized to edit this order.", success: false };

  // update_walkin_order is service-role only — ownership verified above.
  const { error } = await createServiceClient().rpc("update_walkin_order", {
    p_order_id: orderId,
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone,
    p_buyer_email: buyerEmail,
    p_amount_paise: amountPaise,
  });
  if (error) return { error: error.message, success: false };

  revalidatePath(`/organizer/events/${orderRow.event_id}`);
  return { error: null, success: true };
}
