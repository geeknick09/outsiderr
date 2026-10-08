import "server-only";

import { revalidatePath } from "next/cache";

import type { CurrentUser } from "../auth/auth";
import type { CheckoutSession } from "../lib/types";
import { createFreeOrder } from "../data/orders";
import { getEvent } from "../data/events";
import { addInterestedTags, updateUserProfile } from "../data/profile";
import { createClient } from "../auth/server";
import {
  startPayment,
  verifyPayment,
  reportPaymentFailure,
} from "./payments";

/**
 * Order orchestration shared by the web server actions and the /api/v1
 * routes. Money movement lives in services/payments.ts + the DB dispatcher
 * (payment_intents → apply_captured_payment); this file only preserves the
 * thin call-shape the callers expect.
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

/** Best-effort: persist buyer details + merge event tags/categories into the profile. */
async function postBookingSideEffects(user: CurrentUser, input: CheckoutInput): Promise<void> {
  try {
    const event = await getEvent(input.eventId);
    const tags = [
      ...(event?.tags ?? []),
      // Category interests share the `cat:<CATEGORY>` convention used by the
      // profile edit form's Categories picker.
      ...(event?.categories ?? []).map((c) => `cat:${c}`),
    ];
    if (tags.length) await addInterestedTags(user, tags);
  } catch (err) {
    console.warn("[booking] interested-tags merge failed:", err);
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

/**
 * Free RSVP - auto-confirmed with tickets minted immediately. The paid
 * manual-UPI path was removed in the Razorpay migration; paid checkout
 * always goes through runCheckout → Razorpay.
 */
export async function runManualCheckout(
  user: CurrentUser,
  input: CheckoutInput & { isFree: boolean },
): Promise<{ error: string | null; orderId?: string }> {
  if (!input.isFree) {
    return { error: "Paid orders go through Razorpay checkout." };
  }

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

  let orderId: string | undefined;
  try {
    const order = await createFreeOrder(user, details);
    orderId = order.id;
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "Could not complete RSVP.";
    return { error: msg };
  }

  await postBookingSideEffects(user, input);

  revalidatePath("/tickets");
  revalidatePath("/profile");
  revalidatePath(`/events/${input.eventId}`);
  return { error: null, orderId };
}

/** Reserve inventory + create a Razorpay order → CheckoutSession for the client. */
export async function runCheckout(
  user: CurrentUser,
  input: CheckoutInput,
): Promise<{ session?: CheckoutSession; error?: string }> {
  const buyerName = input.buyerName?.trim() || user.name;
  const buyerPhone = input.buyerPhone?.trim() || (user.phone ?? "");
  const buyerEmail = input.buyerEmail?.trim() || null;
  const buyerGender = input.buyerGender?.trim() || null;

  const phoneError = validPhoneOrError(buyerPhone);
  if (phoneError) return { error: phoneError };

  const { result, error } = await startPayment(user, {
    kind: "TICKET_ORDER",
    eventId: input.eventId,
    tierId: input.tierId,
    quantity: input.quantity,
    buyerName,
    buyerPhone,
    buyerEmail,
    buyerGender,
    idempotencyKey: input.utrReference ?? null, // reuses the slot as a client idempotency key
  });
  if (error || !result?.session) return { error: error ?? "Could not start payment." };

  await postBookingSideEffects(user, { ...input, buyerName, buyerPhone, buyerGender });
  return { session: result.session };
}

/** Verify Razorpay signature + confirm the order (idempotent vs the webhook). */
export async function runVerifyPayment(
  user: CurrentUser,
  input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    paymentMethod?: string | null;
  },
): Promise<{ success: boolean; error?: string; orderId?: string }> {
  const result = await verifyPayment(user, input);
  if (result.success) {
    revalidatePath("/tickets");
    revalidatePath("/profile");
    revalidatePath("/organizer");
  }
  return { success: result.success, error: result.error, orderId: result.orderId };
}

/** Release a RESERVED order's inventory when payment fails/abandons. */
export async function runPaymentFailure(
  user: CurrentUser,
  input: { razorpayOrderId: string },
): Promise<{ success: boolean; error?: string }> {
  const result = await reportPaymentFailure(user, input);
  if (result.success) revalidatePath("/checkout");
  return result;
}

/**
 * User-requested refund for a postponed event. The RPC creates the PENDING
 * refund row (ticket price only - BMS model) and the refund worker pushes
 * it to Razorpay asynchronously; no gateway calls happen inline here.
 */
export async function runPostponementRefund(
  user: CurrentUser,
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("request_postponement_refund", {
      p_event_id: eventId,
      p_user_id: user.id,
    });
    if (error) throw new Error(error.message);

    const row = data?.[0];
    if (!row) {
      return { success: false, error: "Could not create refund request." };
    }

    revalidatePath("/tickets");
    revalidatePath(`/events/${eventId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not request refund.",
    };
  }
}