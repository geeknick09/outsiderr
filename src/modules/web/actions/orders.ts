"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

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
// submitPaymentAction - used for free events (instant RSVP) and paid events
// (manual UPI payment with organizer verification).
// Free events: auto-confirmed with tickets.
// Paid events: creates PENDING_VERIFICATION order, organizer approves/denies.
// UTR reference is optional - the organizer verifies payment manually.
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
    inviteToken: String(formData.get("inviteToken") ?? "") || null,
    promoterSlug: (await cookies()).get("oc_promo")?.value ?? null,
    promoCode: String(formData.get("promoCode") ?? "").trim() || null,
  });

  if (result.error) return { error: result.error };
  redirect("/tickets?submitted=1");
}

// ============================================================================
// RAZORPAY: createCheckoutAction - reserve inventory + create Razorpay order.
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
    inviteToken: String(formData.get("inviteToken") ?? "") || null,
    promoterSlug: (await cookies()).get("oc_promo")?.value ?? null,
    promoCode: String(formData.get("promoCode") ?? "").trim() || null,
  });
}

// ============================================================================
// RAZORPAY: verifyPaymentAction - verify signature + confirm order.
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
// RAZORPAY: handlePaymentFailureAction - release reserved inventory.
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
// Payment status - polls the order/intent for the checkout status page
// ============================================================================

export async function getPaymentStatusAction(input: {
  orderId: string;
}): Promise<{
  status: string;
  kind: string | null;
  refStatus: string | null;
  orderId: string | null;
  expiresAt: string | null;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const { getPaymentStatus } = await import("@/modules/shared/server");
  const result = await getPaymentStatus(user, { orderId: input.orderId });
  if (!result) return null;
  return {
    status: result.status,
    kind: result.kind,
    refStatus: result.refStatus,
    orderId: result.orderId,
    expiresAt: result.expiresAt,
  };
}

// ============================================================================
// Postponement refund - user requests a refund for a postponed event
// ============================================================================

export async function requestPostponementRefundAction(
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  return runPostponementRefund(user, eventId);
}

/** User chose "keep my ticket" - clears the refund offer on their order. */
export async function declineRefundOfferAction(
  orderId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  const { createClient } = await import("@/modules/shared/server");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_refund_offer", { p_order_id: orderId });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
