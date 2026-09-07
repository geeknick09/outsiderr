"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  activateHeroBoost,
  cancelHeroBoost,
  cancelHeroBoostsForEvent,
  createHeroBoost,
  getHeroBoostForEvent,
  submitHeroBoostUtr,
} from "@/lib/data/hero-boosts";
import { getHeroBoostDurationDays, getHeroBoostPrice } from "@/lib/data/platform-settings";
import { createClient } from "@/lib/supabase/server";
import { getRazorpay, getPublicKeyId, isRazorpayConfigured } from "@/lib/razorpay";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay-verify";
import type { CheckoutSession } from "@/lib/types";

/**
 * Check if the current user is an admin.
 * Mirrors the requireAdmin() logic from src/actions/admin.ts, including
 * the fallback that allows the first user when no admin exists yet.
 */
async function checkAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.is_admin === true;
}

export async function purchaseHeroBoostAction(eventId: string): Promise<{
  error?: string;
  boostId?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to boost your event." };

  const price = await getHeroBoostPrice();
  try {
    const boost = await createHeroBoost(user, eventId, price);
    revalidatePath("/organizer");
    revalidatePath(`/organizer/events/${eventId}`);
    return { boostId: boost.id };
  } catch (err) {
    console.error("purchaseHeroBoostAction error:", err);
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to create boost.";
    return { error: message };
  }
}

export async function submitHeroBoostUtrAction(
  boostId: string,
  utrReference: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in." };
  if (!utrReference.trim()) return { error: "Enter the UTR reference." };

  try {
    await submitHeroBoostUtr(user, boostId, utrReference.trim());
    revalidatePath("/organizer");
    return {};
  } catch (err) {
    console.error("submitHeroBoostUtrAction error:", err);
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to submit UTR.";
    return { error: message };
  }
}

export async function activateHeroBoostAction(boostId: string): Promise<{ error?: string }> {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return { error: "Admin only." };

  const durationDays = await getHeroBoostDurationDays();
  try {
    await activateHeroBoost(boostId, durationDays);
    revalidatePath("/admin");
    revalidatePath("/admin/hero-boosts");
    revalidatePath("/admin/boosts");
    revalidatePath("/organizer");
    revalidatePath("/");
    return {};
  } catch (err) {
    console.error("activateHeroBoostAction error:", err);
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to activate boost.";
    return { error: message };
  }
}

export async function cancelHeroBoostAction(boostId: string): Promise<{ error?: string }> {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return { error: "Admin only." };

  try {
    await cancelHeroBoost(boostId);
    revalidatePath("/admin");
    revalidatePath("/admin/hero-boosts");
    revalidatePath("/admin/boosts");
    revalidatePath("/organizer");
    revalidatePath("/");
    return {};
  } catch (err) {
    console.error("cancelHeroBoostAction error:", err);
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to cancel boost.";
    return { error: message };
  }
}

/**
 * Called when an event is cancelled — removes it from Hero immediately.
 */
export async function onEventCancelled(eventId: string): Promise<void> {
  await cancelHeroBoostsForEvent(eventId);
  revalidatePath("/");
}

// ============================================================================
// RAZORPAY: Hero Boost purchase via Razorpay Checkout
// ============================================================================

/**
 * Create a pending hero boost + Razorpay order for it.
 * Returns a CheckoutSession the client uses to open Razorpay Checkout.
 */
export async function createHeroBoostCheckoutAction(
  eventId: string,
): Promise<{ session?: CheckoutSession; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to boost your event." };

  if (!isRazorpayConfigured()) {
    return { error: "Online payments are not configured yet." };
  }

  const price = await getHeroBoostPrice();
  let boost;
  try {
    boost = await createHeroBoost(user, eventId, price);
  } catch (err) {
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to create boost.";
    return { error: message };
  }

  // Create Razorpay order for the boost
  const razorpay = getRazorpay();
  let razorpayOrderId: string;
  try {
    const order = await razorpay.orders.create({
      amount: price,
      currency: "INR",
      receipt: boost.id,
      notes: {
        boost_id: boost.id,
        event_id: eventId,
        type: "HERO_BOOST",
      },
    });
    razorpayOrderId = order.id;
  } catch (err) {
    // Clean up the pending boost if Razorpay order creation fails
    try {
      await cancelHeroBoost(boost.id);
    } catch {
      // best-effort
    }
    return {
      error: err instanceof Error ? `Payment gateway error: ${err.message}` : "Could not create payment order.",
    };
  }

  // Link Razorpay order id to the boost — if this fails, the payment cannot be verified
  const supabase = await createClient();
  const { error: linkError } = await supabase
    .from("hero_boosts")
    .update({ razorpay_order_id: razorpayOrderId })
    .eq("id", boost.id);

  if (linkError) {
    // Critical: if we can't link the order, cancel the boost so the user isn't charged
    // without a way to verify their payment
    try {
      await cancelHeroBoost(boost.id);
    } catch {
      // best-effort cleanup
    }
    return {
      error: "Failed to link payment order. Please try again.",
    };
  }

  return {
    session: {
      orderId: boost.id,
      razorpayOrderId,
      amountPaise: price,
      currency: "INR",
      keyId: getPublicKeyId(),
      eventTitle: "Front Row Boost",
      tierName: "Hero Boost",
      quantity: 1,
      buyerName: user.name,
      buyerEmail: user.email ?? null,
      buyerPhone: user.phone ?? null,
    },
  };
}

/**
 * Verify Razorpay payment for a hero boost and activate it.
 * Called after Razorpay Checkout returns successfully.
 */
export async function verifyHeroBoostPaymentAction(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in." };

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return { success: false, error: "Payment verification not configured." };

  // Verify signature
  const valid = verifyRazorpayPaymentSignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
    keySecret,
  );
  if (!valid) return { success: false, error: "Payment signature verification failed." };

  // Find the boost by razorpay_order_id
  const supabase = await createClient();
  const { data: boost } = await supabase
    .from("hero_boosts")
    .select("id, status, event_id")
    .eq("razorpay_order_id", input.razorpayOrderId)
    .maybeSingle();

  if (!boost) return { success: false, error: "Boost not found for this payment." };
  if (boost.status === "ACTIVE") return { success: true }; // idempotent

  // Update boost with payment id + activate
  const durationDays = await getHeroBoostDurationDays();
  await supabase
    .from("hero_boosts")
    .update({ razorpay_payment_id: input.razorpayPaymentId })
    .eq("id", boost.id);

  try {
    await activateHeroBoost(boost.id, durationDays);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to activate boost.",
    };
  }

  // Insert ledger entry
  try {
    const { data: boostRow } = await supabase
      .from("hero_boosts")
      .select("amount_paise, organizer_id, event_id")
      .eq("id", boost.id)
      .maybeSingle();

    if (boostRow) {
      await supabase.from("payment_ledger").insert({
        order_id: null,
        event_id: boostRow.event_id,
        organizer_id: boostRow.organizer_id,
        type: "BOOST_SALE",
        gross_amount_paise: boostRow.amount_paise,
        commission_paise: boostRow.amount_paise, // boost is platform revenue
        convenience_fee_paise: 0,
        net_organizer_paise: 0,
        net_platform_paise: boostRow.amount_paise,
        razorpay_payment_id: input.razorpayPaymentId,
        notes: "Hero Boost purchase",
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Ledger insert for boost failed:", err);
  }

  revalidatePath("/organizer");
  revalidatePath("/admin");
  revalidatePath("/admin/boosts");
  revalidatePath("/");
  return { success: true };
}

/**
 * Handle Hero Boost payment failure — cancel the pending boost so the organizer can retry.
 * Called when Razorpay Checkout is dismissed or payment fails for a Hero Boost.
 */
export async function handleHeroBoostFailureAction(input: {
  razorpayOrderId: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  const supabase = await createClient();
  const { data: boost } = await supabase
    .from("hero_boosts")
    .select("id, status, organizer_id")
    .eq("razorpay_order_id", input.razorpayOrderId)
    .maybeSingle();

  if (!boost) {
    // Boost may have already been cancelled — safe to return success
    return { success: true };
  }

  // Only cancel if still PENDING — don't touch ACTIVE/CANCELLED boosts
  if (boost.status !== "PENDING") {
    return { success: true };
  }

  try {
    await cancelHeroBoost(boost.id);
    revalidatePath("/organizer");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not cancel boost.",
    };
  }
}

export { getHeroBoostForEvent };
