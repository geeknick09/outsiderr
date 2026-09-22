"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/shared/server";
import {
  runCheckout,
  runManualCheckout,
  runPaymentFailure,
  runPostponementRefund,
  runVerifyPayment,
} from "@/modules/shared/server";
import type { CheckoutSession } from "@/modules/shared";

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

  if (!user) {
    return { error: "Please sign in to continue." };
  }

  const eventId = String(formData.get("eventId") ?? "");
  const result = await runManualCheckout(user, {
    eventId,
    tierId: String(formData.get("tierId") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1),
    isFree: formData.get("isFree") === "1",
    buyerName: String(formData.get("buyerName") ?? ""),
    buyerPhone: String(formData.get("buyerPhone") ?? ""),
    buyerEmail: String(formData.get("buyerEmail") ?? ""),
    buyerGender: String(formData.get("buyerGender") ?? ""),
    utrReference: String(formData.get("utrReference") ?? ""),
  });

  if (result.error) return { error: result.error };
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

  return runCheckout(user, {
    eventId: String(formData.get("eventId") ?? ""),
    tierId: String(formData.get("tierId") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1),
    buyerName: String(formData.get("buyerName") ?? ""),
    buyerPhone: String(formData.get("buyerPhone") ?? ""),
    buyerEmail: String(formData.get("buyerEmail") ?? ""),
    buyerGender: String(formData.get("buyerGender") ?? ""),
  });
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

  return runVerifyPayment(user, input);
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

  return runPaymentFailure(user, input);
}


// ============================================================================
// Postponement refund — user requests a refund for a postponed event
// ============================================================================

export async function requestPostponementRefundAction(
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  return runPostponementRefund(user, eventId);
}
