import "server-only";

import { revalidatePath } from "next/cache";

import type { CurrentUser } from "../auth/auth";
import type { CheckoutSession } from "../lib/types";
import {
  confirmRazorpayOrder,
  createFreeOrder,
  createOrder,
  createReservedOrder,
  failRazorpayOrder,
  findOrderByRazorpayOrderId,
  setRazorpayOrderId,
} from "../data/orders";
import { getEvent } from "../data/events";
import { addInterestedTags, updateUserProfile } from "../data/profile";
import { createClient } from "../auth/server";
import { getPublicKeyId, getRazorpay, isRazorpayConfigured } from "../lib/razorpay";
import { verifyRazorpayPaymentSignature } from "../lib/razorpay-verify";

/**
 * Order/payment orchestration shared by the web server actions and the
 * /api/v1 routes. These functions take an already-resolved CurrentUser and use
 * createClient() internally — which resolves cookie or bearer auth depending
 * on the request context — so both surfaces share identical behavior.
 */

export interface CheckoutInput {
  eventId: string;
  tierId: string;
  quantity: number;
  buyerName?: string | null;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  buyerGender?: string | null;
  utrReference?: string | null;
}

function validPhoneOrError(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/^\+91/, "").replace(/\D/g, "");
  return digits.length !== 10
    ? "Please enter a valid 10-digit Indian phone number."
    : null;
}

/** Best-effort: persist buyer details + merge event tags into the profile. */
async function postBookingSideEffects(user: CurrentUser, input: CheckoutInput): Promise<void> {
  try {
    const event = await getEvent(input.eventId);
    if (event?.tags?.length) await addInterestedTags(user, event.tags);
  } catch {
    // Non-critical
  }
  try {
    const buyerName = input.buyerName?.trim();
    const buyerPhone = input.buyerPhone?.trim();
    const buyerGender = input.buyerGender?.trim() || null;
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
}

/** Free ticket or manual-UPI order (PENDING_VERIFICATION). */
export async function runManualCheckout(
  user: CurrentUser,
  input: CheckoutInput & { isFree: boolean },
): Promise<{ error: string | null }> {
  const phoneError = validPhoneOrError(input.buyerPhone?.trim());
  if (phoneError) return { error: phoneError };

  const details = {
    eventId: input.eventId,
    tierId: input.tierId,
    quantity: input.quantity,
    buyerName: input.buyerName?.trim() || user.name,
    buyerPhone: input.buyerPhone?.trim() || (user.phone ?? ""),
    buyerEmail: input.buyerEmail?.trim() || null,
    buyerGender: input.buyerGender?.trim() || null,
  };

  try {
    if (input.isFree) {
      await createFreeOrder(user, details);
    } else {
      await createOrder(user, {
        ...details,
        utrReference: input.utrReference?.trim() || null,
        paymentProofUrl: null,
      });
    }
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String(error.message)
          : input.isFree
            ? "Could not complete RSVP."
            : "Could not submit payment.";
    return { error: msg };
  }

  await postBookingSideEffects(user, input);

  revalidatePath("/tickets");
  revalidatePath("/profile");
  revalidatePath(`/events/${input.eventId}`);
  return { error: null };
}

/** Reserve inventory + create a Razorpay order → CheckoutSession for the client. */
export async function runCheckout(
  user: CurrentUser,
  input: CheckoutInput,
): Promise<{ session?: CheckoutSession; error?: string }> {
  if (!isRazorpayConfigured()) {
    return { error: "Online payments are not configured yet. Please try again later." };
  }

  const buyerName = input.buyerName?.trim() || user.name;
  const buyerPhone = input.buyerPhone?.trim() || (user.phone ?? "");
  const buyerEmail = input.buyerEmail?.trim() || null;
  const buyerGender = input.buyerGender?.trim() || null;

  console.log(`[checkout] runCheckout: eventId=${input.eventId}, tierId=${input.tierId}, qty=${input.quantity}, userId=${user.id}`);

  const phoneError = validPhoneOrError(buyerPhone);
  if (phoneError) return { error: phoneError };

  let reserved;
  try {
    reserved = await createReservedOrder(user, {
      eventId: input.eventId,
      tierId: input.tierId,
      quantity: input.quantity,
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

  const razorpay = getRazorpay();
  let razorpayOrderId: string;
  try {
    const event = await getEvent(input.eventId);
    const tier = event?.tiers.find((t) => t.id === input.tierId);
    const order = await razorpay.orders.create({
      amount: reserved.totalPaise,
      currency: "INR",
      receipt: reserved.id,
      notes: {
        event_id: input.eventId,
        tier_id: input.tierId,
        order_id: reserved.id,
        event_title: event?.title ?? "",
        tier_name: tier?.name ?? "",
      },
    });
    razorpayOrderId = order.id;
  } catch (error) {
    try {
      await failRazorpayOrder(reserved.id);
    } catch {
      // best-effort cleanup
    }
    return {
      error: error instanceof Error ? `Payment gateway error: ${error.message}` : "Could not create payment order.",
    };
  }

  // Link the Razorpay order id — if this fails the payment can never be
  // confirmed, so fail the reservation instead.
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

  await postBookingSideEffects(user, { ...input, buyerName, buyerPhone, buyerGender });

  const event = await getEvent(input.eventId);
  const tier = event?.tiers.find((t) => t.id === input.tierId);

  return {
    session: {
      orderId: reserved.id,
      razorpayOrderId,
      amountPaise: reserved.totalPaise,
      currency: "INR",
      keyId: getPublicKeyId(),
      eventTitle: event?.title ?? "Event",
      tierName: tier?.name ?? "Ticket",
      quantity: input.quantity,
      buyerName,
      buyerEmail,
      buyerPhone,
    },
  };
}

/** Verify Razorpay signature + confirm the order (idempotent). */
export async function runVerifyPayment(
  user: CurrentUser,
  input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    paymentMethod?: string | null;
  },
): Promise<{ success: boolean; error?: string; orderId?: string }> {
  console.log(`[verify-payment] runVerifyPayment: razorpayOrderId=${input.razorpayOrderId}, razorpayPaymentId=${input.razorpayPaymentId}, userId=${user.id}`);

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return { success: false, error: "Payment verification not configured." };

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

  const order = await findOrderByRazorpayOrderId(input.razorpayOrderId);
  if (!order) {
    console.error(`[verify-payment] Order not found: razorpayOrderId=${input.razorpayOrderId}`);
    return { success: false, error: "Order not found for this payment." };
  }

  if (order.userId !== user.id) {
    return { success: false, error: "This payment does not belong to your account." };
  }

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

  // Insert payment ledger entry (best-effort; webhook may already have)
  try {
    const supabase = await createClient();
    const { data: orderRow } = await supabase
      .from("orders")
      .select("event_id, commission_paise, convenience_fee_paise, organizer_payout_paise, subtotal_paise, platform_fee_paise, total_paise")
      .eq("id", order.id)
      .maybeSingle();

    if (orderRow) {
      const { data: eventRow } = await supabase
        .from("events")
        .select("organizer_id")
        .eq("id", orderRow.event_id)
        .maybeSingle();

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
          razorpay_fee_paise: 0,
          net_organizer_paise: orderRow.organizer_payout_paise ?? 0,
          net_platform_paise: orderRow.platform_fee_paise ?? 0,
          razorpay_payment_id: input.razorpayPaymentId,
          notes: "Razorpay checkout confirmation",
          created_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error("Ledger insert failed:", err);
  }

  revalidatePath("/tickets");
  revalidatePath("/profile");
  revalidatePath("/organizer");
  revalidatePath(`/events/${order.eventId}`);

  return { success: true, orderId: order.id };
}

/** Release a RESERVED order's inventory when payment fails/abandons. */
export async function runPaymentFailure(
  user: CurrentUser,
  input: { razorpayOrderId: string },
): Promise<{ success: boolean; error?: string }> {
  console.log(`[payment-failure] runPaymentFailure: razorpayOrderId=${input.razorpayOrderId}, userId=${user.id}`);

  const order = await findOrderByRazorpayOrderId(input.razorpayOrderId);
  if (!order) {
    console.log(`[payment-failure] Order not found (likely expired): razorpayOrderId=${input.razorpayOrderId}`);
    return { success: true };
  }

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

/** User-requested refund for a postponed event (auto-refunds via Razorpay if paid). */
export async function runPostponementRefund(
  user: CurrentUser,
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  console.log(`[postponement-refund] runPostponementRefund: eventId=${eventId}, userId=${user.id}`);

  try {
    const supabase = await createClient();

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

    if (row.razorpay_payment_id) {
      try {
        if (isRazorpayConfigured()) {
          const razorpay = getRazorpay();
          const refund = await razorpay.payments.refund(row.razorpay_payment_id, {
            amount: row.total_paise,
            notes: {
              order_id: String(row.order_id),
              reason: "Postponement refund requested by user",
            },
          });

          await supabase
            .from("refunds")
            .update({
              razorpay_refund_id: refund.id,
              razorpay_payment_id: row.razorpay_payment_id,
              status: "INITIATED",
            })
            .eq("order_id", row.order_id)
            .eq("status", "PENDING");

          await supabase
            .from("orders")
            .update({ status: "REFUNDED" })
            .eq("id", row.order_id);

          console.log(`[postponement-refund] Razorpay refund initiated: orderId=${row.order_id}, razorpayRefundId=${refund.id}, amount=${row.total_paise}paise`);

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
      }
    } else {
      console.log(`[postponement-refund] No Razorpay payment ID for orderId=${row.order_id} — free order or legacy, no external refund needed`);
    }

    revalidatePath("/tickets");
    revalidatePath(`/events/${eventId}`);
    console.log(`[postponement-refund] runPostponementRefund complete: eventId=${eventId}, userId=${user.id}`);
    return { success: true };
  } catch (error) {
    console.error(`[postponement-refund] runPostponementRefund error: eventId=${eventId}, userId=${user.id}, error=`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not request refund.",
    };
  }
}
