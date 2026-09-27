"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/shared/server";
import { requestBoost, notifyAdmins } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";

export interface RequestBoostInput {
  eventId: string;
  slot: number;
  amountPaidPaise: number;
  startsAt: string;
  endsAt: string;
  utrReference?: string;
}

export async function requestBoostAction(input: RequestBoostInput): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer%2Fboost");

  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("Create an organizer profile first.");

  if (!input.eventId) throw new Error("Select an event.");
  if (!input.slot || input.slot < 1 || input.slot > 10) throw new Error("Invalid slot.");

  await requestBoost(user, {
    eventId: input.eventId,
    organizerId: organizer.id,
    slot: input.slot,
    amountPaidPaise: input.amountPaidPaise,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    utrReference: input.utrReference?.trim() || null,
  });

  await notifyAdmins({
    type: "BOOST_REQUESTED",
    message: `Boost request: ${organizer.name} — slot ${input.slot}, ₹${Math.round(input.amountPaidPaise / 100)}${input.utrReference ? ` (UTR ${input.utrReference})` : ""}.`,
  });

  revalidatePath("/organizer/boost");
  revalidatePath("/admin/boosts");
}

// ============================================================================
// RAZORPAY: slot boost via the unified payment intent pipeline — creates the
// PENDING boost + intent in one step, then Checkout.js pays it. The dispatcher
// activates the slot on capture.
// ============================================================================

export async function startBoostCheckoutAction(input: {
  eventId: string;
  slot: number;
  days: number;
}): Promise<{ session?: import("@/modules/shared").CheckoutSession; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to continue." };

  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "Create an organizer profile first." };
  if (!input.eventId) return { error: "Select an event." };
  if (!input.slot || input.slot < 1 || input.slot > 10) return { error: "Invalid slot." };
  if (!input.days || input.days < 1) return { error: "Invalid duration." };

  const startsAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + input.days * 86_400_000).toISOString();

  try {
    // Price is computed server-side: daily slot price × days (same formula
    // create_payment_intent uses — the intent revalidates it at capture).
    const { listBoostSlotPrices } = await import("@/modules/shared/server");
    const prices = await listBoostSlotPrices();
    const dailyPaise = prices.find((p) => p.slot === input.slot)?.pricePaise;
    if (!dailyPaise) return { error: "That slot isn't priced. Try another." };

    const boost = await requestBoost(user, {
      eventId: input.eventId,
      organizerId: organizer.id,
      slot: input.slot,
      amountPaidPaise: dailyPaise * input.days,
      startsAt,
      endsAt,
      utrReference: null,
    });

    const { startPayment } = await import("@/modules/shared/services/payments");
    const { result, error } = await startPayment(user, {
      kind: "SLOT_BOOST",
      refId: boost.id,
      itemTitle: `Featured slot ${input.slot}`,
    });
    if (error || !result) return { error: error ?? "Could not start payment." };

    return {
      session: {
        orderId: boost.id,
        razorpayOrderId: result.razorpayOrderId,
        amountPaise: result.amountPaise,
        currency: "INR",
        keyId: result.keyId,
        eventTitle: `Boost slot ${input.slot}`,
        tierName: `${input.days} day${input.days === 1 ? "" : "s"}`,
        quantity: 1,
        buyerName: user.name,
        buyerEmail: user.email ?? null,
        buyerPhone: user.phone ?? null,
        intentId: result.intentId,
        expiresAt: result.expiresAt,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the boost." };
  }
}

export async function verifyBoostPaymentAction(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in." };
  const { verifyPayment } = await import("@/modules/shared/services/payments");
  const result = await verifyPayment(user, input);
  if (result.success) {
    revalidatePath("/organizer/boost");
    revalidatePath("/");
  }
  return { success: result.success, error: result.error };
}

export async function handleBoostFailureAction(input: {
  razorpayOrderId: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };
  const { reportPaymentFailure } = await import("@/modules/shared/services/payments");
  const result = await reportPaymentFailure(user, input);
  if (result.success) revalidatePath("/organizer/boost");
  return result;
}
