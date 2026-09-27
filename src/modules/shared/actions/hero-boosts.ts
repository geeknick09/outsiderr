"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "../auth/auth";
import { activateHeroBoost, cancelHeroBoost, cancelHeroBoostsForEvent, createHeroBoost, getHeroBoostForEvent, submitHeroBoostUtr } from "../data/hero-boosts";
import { getHeroBoostDurationDays, getHeroBoostPrice } from "../data/platform-settings";
import { createClient } from "../auth/server";
import { CheckoutSession } from "../lib/types";

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
    const { notifyAdmins } = await import("../notifications");
    await notifyAdmins({
      type: "BOOST_REQUESTED",
      message: `Hero Boost payment submitted (UTR ${utrReference.trim()}) — pending verification.`,
    });
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
 * Verifies the caller owns the event (or is admin) before mutating boosts.
 */
export async function onEventCancelled(eventId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const { getOrganizerProfile } = await import("../data/organizer-profile");
  const organizer = await getOrganizerProfile(user);
  const supabase = await createClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", organizer?.id ?? "")
    .maybeSingle();
  const admin = await checkAdmin();
  if (!eventRow && !admin) return;
  await cancelHeroBoostsForEvent(eventId);
  revalidatePath("/");
}

// ============================================================================
// RAZORPAY: Hero Boost purchase via the unified payment intent pipeline
// ============================================================================

/**
 * Create a pending hero boost → payment intent → Razorpay order. The boost's
 * activation happens in the capture dispatcher (webhook or client verify —
 * whichever lands first), never inline here.
 */
export async function createHeroBoostCheckoutAction(
  eventId: string,
): Promise<{ session?: CheckoutSession; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to boost your event." };

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

  const { startPayment } = await import("../services/payments");
  const { result, error } = await startPayment(user, {
    kind: "HERO_BOOST",
    refId: boost.id,
    itemTitle: "Front Row Boost — Hero",
  });
  if (error || !result) {
    try { await cancelHeroBoost(boost.id); } catch { /* best-effort */ }
    return { error: error ?? "Could not start payment." };
  }

  return {
    session: {
      orderId: boost.id,
      razorpayOrderId: result.razorpayOrderId,
      amountPaise: result.amountPaise,
      currency: "INR",
      keyId: result.keyId,
      eventTitle: "Front Row Boost",
      tierName: "Hero Boost",
      quantity: 1,
      buyerName: user.name,
      buyerEmail: user.email ?? null,
      buyerPhone: user.phone ?? null,
      intentId: result.intentId,
      expiresAt: result.expiresAt,
    },
  };
}

/**
 * Verify a hero-boost payment and dispatch the capture — the dispatcher
 * activates the boost + writes the BOOST_SALE ledger row, idempotent vs the
 * webhook.
 */
export async function verifyHeroBoostPaymentAction(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in." };

  const { verifyPayment } = await import("../services/payments");
  const result = await verifyPayment(user, input);
  if (result.success) {
    revalidatePath("/organizer");
    revalidatePath("/admin");
    revalidatePath("/admin/boosts");
    revalidatePath("/");
  }
  return { success: result.success, error: result.error };
}

/** Boost payment dismissed/failed → release the pending boost via the dispatcher. */
export async function handleHeroBoostFailureAction(input: {
  razorpayOrderId: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  const { reportPaymentFailure } = await import("../services/payments");
  const result = await reportPaymentFailure(user, input);
  if (result.success) revalidatePath("/organizer");
  return result;
}

export { getHeroBoostForEvent };
