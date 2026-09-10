"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import {
  approveOrder,
  checkInTicket,
  confirmRazorpayOrder,
  createFreeOrder,
  createOrder,
  createReservedOrder,
  failRazorpayOrder,
  rejectOrder,
  setRazorpayOrderId,
} from "@/lib/data/orders";
import { getEvent } from "@/lib/data/events";
import { addInterestedTags, updateUserProfile } from "@/lib/data/profile";
import { getRazorpay, getPublicKeyId, isRazorpayConfigured } from "@/lib/razorpay";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay-verify";
import type { CheckoutSession, ScanResult } from "@/lib/types";

export interface CheckoutState {
  error: string | null;
}

// ============================================================================
// submitPaymentAction — used for free events (instant RSVP) and paid events
// (manual UPI payment with organizer verification).
// Free events: auto-confirmed with tickets.
// Paid events: creates PENDING_VERIFICATION order, organizer approves/denies.
// UTR reference is optional — the organizer verifies payment manually.
// ============================================================================

export async function submitPaymentAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await getCurrentUser();
  const eventId = String(formData.get("eventId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const isFree = formData.get("isFree") === "1";

  if (!user) {
    return { error: "Please sign in to continue." };
  }

  // Validate phone number — must be +91 followed by exactly 10 digits
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim();
  if (buyerPhone) {
    const phoneDigits = buyerPhone.replace(/^\+91/, "").replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      return { error: "Please enter a valid 10-digit Indian phone number." };
    }
  }

  // Free events: skip UTR, auto-confirm
  if (isFree) {
    try {
      await createFreeOrder(user, {
        eventId,
        tierId,
        quantity,
        buyerName: String(formData.get("buyerName") ?? "").trim() || user.name,
        buyerPhone: String(formData.get("buyerPhone") ?? "").trim() || (user.phone ?? ""),
        buyerEmail: String(formData.get("buyerEmail") ?? "").trim() || null,
        buyerGender: String(formData.get("buyerGender") ?? "").trim() || null,
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Could not complete RSVP.",
      };
    }
    // Auto-merge event tags into user's interested-in list
    try {
      const event = await getEvent(eventId);
      if (event?.tags?.length) await addInterestedTags(user, event.tags);
    } catch {
      // Non-critical — don't block booking on tag merge failure
    }
    // Auto-save buyer details to profile (best-effort)
    try {
      const buyerName = String(formData.get("buyerName") ?? "").trim();
      const buyerPhoneVal = String(formData.get("buyerPhone") ?? "").trim();
      const buyerGender = String(formData.get("buyerGender") ?? "").trim() || null;
      if (buyerName || buyerPhoneVal || buyerGender) {
        await updateUserProfile(user, {
          ...(buyerName ? { fullName: buyerName } : {}),
          ...(buyerPhoneVal ? { phone: buyerPhoneVal } : {}),
          ...(buyerGender ? { gender: buyerGender } : {}),
        });
      }
    } catch {
      // Non-critical — don't block booking on profile update failure
    }
    revalidatePath("/tickets");
    revalidatePath("/profile");
    revalidatePath(`/events/${eventId}`);
    redirect("/tickets?submitted=1");
  }

  // Paid events via manual UPI flow — organizer verifies payment.
  // UTR is optional (helps organizer find payment faster but not required).
  const utrReference = String(formData.get("utrReference") ?? "").trim() || null;

  try {
    await createOrder(user, {
      eventId,
      tierId,
      quantity,
      utrReference,
      paymentProofUrl: null,
      buyerName: String(formData.get("buyerName") ?? "").trim() || user.name,
      buyerPhone: String(formData.get("buyerPhone") ?? "").trim() || (user.phone ?? ""),
      buyerEmail: String(formData.get("buyerEmail") ?? "").trim() || null,
      buyerGender: String(formData.get("buyerGender") ?? "").trim() || null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : (typeof error === "object" && error && "message" in error ? String(error.message) : "Could not submit payment.");
    return { error: msg };
  }

  // Auto-merge event tags into user's interested-in list
  try {
    const event = await getEvent(eventId);
    if (event?.tags?.length) await addInterestedTags(user, event.tags);
  } catch {
    // Non-critical — don't block booking on tag merge failure
  }
  // Auto-save buyer details to profile (best-effort)
  try {
    const buyerName = String(formData.get("buyerName") ?? "").trim();
    const buyerPhoneVal = String(formData.get("buyerPhone") ?? "").trim();
    const buyerGender = String(formData.get("buyerGender") ?? "").trim() || null;
    if (buyerName || buyerPhoneVal || buyerGender) {
      await updateUserProfile(user, {
        ...(buyerName ? { fullName: buyerName } : {}),
        ...(buyerPhoneVal ? { phone: buyerPhoneVal } : {}),
        ...(buyerGender ? { gender: buyerGender } : {}),
      });
    }
  } catch {
    // Non-critical — don't block booking on profile update failure
  }

  revalidatePath("/tickets");
  revalidatePath("/profile");
  revalidatePath(`/events/${eventId}`);
  redirect("/tickets?submitted=1");
}

// ============================================================================
// RAZORPAY: createCheckoutAction — reserve inventory + create Razorpay order.
// Returns a CheckoutSession the client uses to open Razorpay Checkout modal.
// ============================================================================

export async function createCheckoutAction(
  formData: FormData,
): Promise<{ session?: CheckoutSession; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to continue." };

  if (!isRazorpayConfigured()) {
    return { error: "Online payments are not configured yet. Please try again later." };
  }

  const eventId = String(formData.get("eventId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const buyerName = String(formData.get("buyerName") ?? "").trim() || user.name;
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim() || (user.phone ?? "");
  const buyerEmail = String(formData.get("buyerEmail") ?? "").trim() || null;
  const buyerGender = String(formData.get("buyerGender") ?? "").trim() || null;

  console.log(`[checkout] createCheckoutAction: eventId=${eventId}, tierId=${tierId}, qty=${quantity}, userId=${user.id}`);

  // Validate phone
  if (buyerPhone) {
    const phoneDigits = buyerPhone.replace(/^\+91/, "").replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      return { error: "Please enter a valid 10-digit Indian phone number." };
    }
  }

  // 1. Reserve inventory + create RESERVED order via RPC
  let reserved;
  try {
    reserved = await createReservedOrder(user, {
      eventId,
      tierId,
      quantity,
      buyerName,
      buyerPhone,
      buyerEmail,
      buyerGender,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not reserve tickets.",
    };
  }

  // 2. Create Razorpay order
  const razorpay = getRazorpay();
  let razorpayOrderId: string;
  try {
    const event = await getEvent(eventId);
    const tier = event?.tiers.find((t) => t.id === tierId);
    const order = await razorpay.orders.create({
      amount: reserved.totalPaise,
      currency: "INR",
      receipt: reserved.id,
      notes: {
        event_id: eventId,
        tier_id: tierId,
        order_id: reserved.id,
        event_title: event?.title ?? "",
        tier_name: tier?.name ?? "",
      },
    });
    razorpayOrderId = order.id;
  } catch (error) {
    // Release the reservation if Razorpay order creation fails
    try {
      await failRazorpayOrder(reserved.id);
    } catch {
      // best-effort cleanup
    }
    return {
      error: error instanceof Error ? `Payment gateway error: ${error.message}` : "Could not create payment order.",
    };
  }

  // 3. Link Razorpay order id to our order — CRITICAL: if this fails,
  // neither the client callback nor the webhook can find the order to confirm it.
  // The user would pay but never receive tickets. Fail the reservation instead.
  try {
    await setRazorpayOrderId(reserved.id, razorpayOrderId);
  } catch (error) {
    console.error("setRazorpayOrderId failed:", error);
    try {
      await failRazorpayOrder(reserved.id);
    } catch {
      // best-effort — cron will also expire the reservation
    }
    return {
      error: "Failed to link payment order. Please try again.",
    };
  }

  // 4. Auto-save buyer details to profile (best-effort)
  try {
    if (buyerName || buyerPhone || buyerGender) {
      await updateUserProfile(user, {
        ...(buyerName ? { fullName: buyerName } : {}),
        ...(buyerPhone ? { phone: buyerPhone } : {}),
        ...(buyerGender ? { gender: buyerGender } : {}),
      });
    }
  } catch {
    // Non-critical
  }

  // 5. Auto-merge event tags
  try {
    const event = await getEvent(eventId);
    if (event?.tags?.length) await addInterestedTags(user, event.tags);
  } catch {
    // Non-critical
  }

  // 6. Build checkout session for the client
  const event = await getEvent(eventId);
  const tier = event?.tiers.find((t) => t.id === tierId);

  return {
    session: {
      orderId: reserved.id,
      razorpayOrderId,
      amountPaise: reserved.totalPaise,
      currency: "INR",
      keyId: getPublicKeyId(),
      eventTitle: event?.title ?? "Event",
      tierName: tier?.name ?? "Ticket",
      quantity,
      buyerName,
      buyerEmail,
      buyerPhone,
    },
  };
}

// ============================================================================
// RAZORPAY: verifyPaymentAction — verify signature + confirm order.
// Called after Razorpay Checkout returns successfully.
// ============================================================================

export async function verifyPaymentAction(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  paymentMethod?: string | null;
}): Promise<{ success: boolean; error?: string; orderId?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  console.log(`[verify-payment] verifyPaymentAction: razorpayOrderId=${input.razorpayOrderId}, razorpayPaymentId=${input.razorpayPaymentId}, userId=${user.id}`);

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return { success: false, error: "Payment verification not configured." };

  // 1. Verify signature server-side (never trust client)
  const valid = verifyRazorpayPaymentSignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
    keySecret,
  );
  if (!valid) {
    console.error(`[verify-payment] Signature verification failed: razorpayOrderId=${input.razorpayOrderId}, userId=${user.id}`);
    return { success: false, error: "Payment signature verification failed." };
  }

  // 2. Find internal order by Razorpay order id
  const { findOrderByRazorpayOrderId } = await import("@/lib/data/orders");
  const order = await findOrderByRazorpayOrderId(input.razorpayOrderId);
  if (!order) {
    console.error(`[verify-payment] Order not found: razorpayOrderId=${input.razorpayOrderId}`);
    return { success: false, error: "Order not found for this payment." };
  }

  // 2a. Ownership check — prevent users from confirming other users' orders
  if (order.userId !== user.id) {
    return { success: false, error: "This payment does not belong to your account." };
  }

  // 3. Confirm order (idempotent — safe if webhook already confirmed)
  try {
    await confirmRazorpayOrder(
      order.id,
      input.razorpayPaymentId,
      input.razorpaySignature,
      input.paymentMethod ?? null,
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not confirm order.",
    };
  }

  // 4. Insert payment ledger entry (best-effort)
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: orderRow } = await supabase
      .from("orders")
      .select("event_id, commission_paise, convenience_fee_paise, organizer_payout_paise, subtotal_paise, platform_fee_paise, total_paise")
      .eq("id", order.id)
      .maybeSingle();

    if (orderRow) {
      // Look up organizer for the event
      const { data: eventRow } = await supabase
        .from("events")
        .select("organizer_id")
        .eq("id", orderRow.event_id)
        .maybeSingle();

      // Idempotency: check if a ledger entry already exists for this payment
      // (the webhook may have already inserted one)
      const { data: existingLedger } = await supabase
        .from("payment_ledger")
        .select("id")
        .eq("razorpay_payment_id", input.razorpayPaymentId)
        .maybeSingle();

      if (!existingLedger) {
        await supabase.from("payment_ledger").insert({
          order_id: order.id,
          event_id: orderRow.event_id,
          organizer_id: eventRow?.organizer_id ?? null,
          type: "TICKET_SALE",
          gross_amount_paise: orderRow.subtotal_paise,
          commission_paise: orderRow.commission_paise ?? 0,
          convenience_fee_paise: orderRow.convenience_fee_paise ?? 0,
          razorpay_fee_paise: 0, // populated later from Razorpay settlement data
          net_organizer_paise: orderRow.organizer_payout_paise ?? 0,
          net_platform_paise: orderRow.platform_fee_paise ?? 0,
          razorpay_payment_id: input.razorpayPaymentId,
          notes: "Razorpay checkout confirmation",
          created_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    // Non-critical — ledger is for reporting, order is already confirmed
    console.error("Ledger insert failed:", err);
  }

  revalidatePath("/tickets");
  revalidatePath("/profile");
  revalidatePath("/organizer");
  revalidatePath(`/events/${order.eventId}`);

  return { success: true, orderId: order.id };
}

// ============================================================================
// RAZORPAY: handlePaymentFailureAction — release reserved inventory.
// Called when Razorpay Checkout is dismissed or payment fails.
// ============================================================================

export async function handlePaymentFailureAction(input: {
  razorpayOrderId: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  console.log(`[payment-failure] handlePaymentFailureAction: razorpayOrderId=${input.razorpayOrderId}, userId=${user.id}`);

  const { findOrderByRazorpayOrderId } = await import("@/lib/data/orders");
  const order = await findOrderByRazorpayOrderId(input.razorpayOrderId);
  if (!order) {
    // Order may have already expired via cron — safe to return success
    console.log(`[payment-failure] Order not found (likely expired): razorpayOrderId=${input.razorpayOrderId}`);
    return { success: true };
  }

  // Ownership check — prevent users from failing other users' orders
  if (order.userId !== user.id) {
    console.warn(`[payment-failure] Ownership mismatch: orderId=${order.id}, ownerId=${order.userId}, userId=${user.id}`);
    return { success: false, error: "This payment does not belong to your account." };
  }

  try {
    await failRazorpayOrder(order.id);
    console.log(`[payment-failure] Order failed: orderId=${order.id}`);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not release reservation.",
    };
  }

  revalidatePath("/checkout");
  return { success: true };
}

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

export async function checkInTicketAction(qrHash: string, eventId: string): Promise<ScanResult> {
  console.log(`[check-in] checkInTicketAction: eventId=${eventId}, qrHash=${qrHash.slice(0, 16)}...`);
  try {
    const result = await checkInTicket(qrHash, eventId);
    console.log(`[check-in] Result: outcome=${result.outcome}, message="${result.message}", holder=${result.ticket?.holderName ?? "null"}, tier=${result.ticket?.tierName ?? "null"}`);
    return result;
  } catch (error) {
    console.error(`[check-in] checkInTicketAction error: eventId=${eventId}, qrHash=${qrHash.slice(0, 16)}..., error=`, error);
    return {
      outcome: "INVALID",
      message: error instanceof Error ? error.message : "Scan failed.",
    };
  }
}

// ============================================================================
// Postponement refund — user requests a refund for a postponed event
// ============================================================================

export async function requestPostponementRefundAction(
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  console.log(`[postponement-refund] requestPostponementRefundAction: eventId=${eventId}, userId=${user.id}`);

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    // Call the RPC to mark order as REFUND_REQUESTED and create refund record
    const { data, error } = await supabase.rpc("request_postponement_refund", {
      p_event_id: eventId,
      p_user_id: user.id,
    });

    if (error) throw new Error(error.message);

    const row = data?.[0];
    if (!row || !row.refund_created) {
      console.warn(`[postponement-refund] RPC returned no refund: eventId=${eventId}, userId=${user.id}`);
      return { success: false, error: "Could not create refund request." };
    }

    console.log(`[postponement-refund] Refund record created: orderId=${row.order_id}, totalPaise=${row.total_paise}, razorpayPaymentId=${row.razorpay_payment_id || "null"}`);

    // If there's a Razorpay payment, process the refund automatically
    if (row.razorpay_payment_id) {
      try {
        const { getRazorpay, isRazorpayConfigured } = await import("@/lib/razorpay");
        if (isRazorpayConfigured()) {
          const razorpay = getRazorpay();
          const refund = await razorpay.payments.refund(row.razorpay_payment_id, {
            amount: row.total_paise,
            notes: {
              order_id: String(row.order_id),
              reason: "Postponement refund requested by user",
            },
          });

          // Update the refund record with the Razorpay refund ID
          await supabase
            .from("refunds")
            .update({
              razorpay_refund_id: refund.id,
              razorpay_payment_id: row.razorpay_payment_id,
              status: "INITIATED",
            })
            .eq("order_id", row.order_id)
            .eq("status", "PENDING");

          // Update order status to REFUNDED
          await supabase
            .from("orders")
            .update({ status: "REFUNDED" })
            .eq("id", row.order_id);

          console.log(`[postponement-refund] Razorpay refund initiated: orderId=${row.order_id}, razorpayRefundId=${refund.id}, amount=${row.total_paise}paise`);

          // Insert payment_ledger entry
          try {
            await supabase.from("payment_ledger").insert({
              order_id: row.order_id,
              event_id: eventId,
              organizer_id: null,
              type: "REFUND",
              gross_amount_paise: -row.total_paise,
              commission_paise: 0,
              convenience_fee_paise: 0,
              razorpay_fee_paise: 0,
              net_organizer_paise: 0,
              net_platform_paise: -row.total_paise,
              razorpay_payment_id: `refund_${refund.id}`,
              notes: "Postponement refund (user requested)",
              created_at: new Date().toISOString(),
            });
          } catch (ledgerErr) {
            console.error("[postponement-refund] Ledger insert failed:", ledgerErr);
          }
        } else {
          console.warn(`[postponement-refund] Razorpay not configured — refund ${row.order_id} stays PENDING for manual processing`);
        }
      } catch (refundErr) {
        console.error(`[postponement-refund] Razorpay refund failed for orderId=${row.order_id}:`, refundErr);
        // The refund record is still PENDING — admin can process it manually
      }
    } else {
      console.log(`[postponement-refund] No Razorpay payment ID for orderId=${row.order_id} — free order or legacy, no external refund needed`);
    }

    revalidatePath("/tickets");
    revalidatePath(`/events/${eventId}`);
    console.log(`[postponement-refund] requestPostponementRefundAction complete: eventId=${eventId}, userId=${user.id}`);
    return { success: true };
  } catch (error) {
    console.error(`[postponement-refund] requestPostponementRefundAction error: eventId=${eventId}, userId=${user.id}, error=`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not request refund.",
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

  if (!eventId) return { error: "Missing event ID.", success: false };
  if (!buyerName) return { error: "Name is required.", success: false };
  if (!buyerPhone) return { error: "Phone is required.", success: false };

  // Validate mode
  if (!["WALKIN_PREEVENT", "WALKIN_QR", "WALKIN_INSTANT"].includes(mode)) {
    return { error: "Invalid check-in mode.", success: false };
  }

  // Verify organizer owns this event
  const { getOrganizerProfile } = await import("@/lib/data/organizer");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "No organizer profile.", success: false };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", organizer.id)
    .maybeSingle();
  if (!eventRow) return { error: "Event not found or not owned by you.", success: false };

  const { data: result, error } = await supabase.rpc("create_walkin_order", {
    p_event_id: eventId,
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone,
    p_tier_id: tierId,
    p_buyer_email: buyerEmail,
    p_amount_paise: amountPaise,
    p_mode: mode,
  });
  if (error) return { error: error.message, success: false };

  const walkinResult = (result ?? {}) as { ticketId?: string; orderId?: string };
  revalidatePath(`/organizer/events/${eventId}`);
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
  const { getOrganizerProfile } = await import("@/lib/data/organizer");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "No organizer profile.", success: false };

  const { createClient } = await import("@/lib/supabase/server");
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

  const { error } = await supabase.rpc("update_walkin_order", {
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
