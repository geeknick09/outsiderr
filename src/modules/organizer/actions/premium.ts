"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { createClient } from "@/modules/shared/server";

/** Premium plan prices (paise) read from platform_settings. */
export async function getPremiumPlans(): Promise<{ months: number; pricePaise: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", ["premium_price_3m_paise", "premium_price_6m_paise", "premium_price_12m_paise"]);
  const map = new Map((data ?? []).map((s) => [s.key, Number(s.value)]));
  return [3, 6, 12]
    .map((m) => ({ months: m, pricePaise: map.get(`premium_price_${m}m_paise`) ?? 0 }))
    .filter((p) => p.pricePaise > 0);
}

/** Whether the analytics gate is on (admin toggle). */
export async function isPremiumGateEnabled(): Promise<boolean> {
  const { getSetting } = await import("@/modules/shared/server");
  const val = await getSetting("premium_analytics_gate");
  return val === "true" || val === true;
}

export async function startPremiumCheckoutAction(input: {
  months: number;
}): Promise<{ session?: import("@/modules/shared").CheckoutSession; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to continue." };

  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "Create an organizer profile first." };
  if (![3, 6, 12].includes(input.months)) return { error: "Pick a valid plan." };

  try {
    const supabase = await createClient();
    const { data: purchase, error } = await supabase.rpc("create_premium_purchase", {
      p_months: input.months,
    });
    if (error || !purchase) return { error: error?.message ?? "Could not start checkout." };

    const { startPayment } = await import("@/modules/shared/services/payments");
    const { result, error: payError } = await startPayment(user, {
      kind: "ORGANIZER_PREMIUM",
      refId: purchase.id,
      itemTitle: `Organizer Premium - ${input.months} months`,
    });
    if (payError || !result) return { error: payError ?? "Could not start payment." };

    return {
      session: {
        orderId: purchase.id,
        razorpayOrderId: result.razorpayOrderId,
        amountPaise: result.amountPaise,
        currency: "INR",
        keyId: result.keyId,
        eventTitle: "Outsiderr Premium",
        tierName: `${input.months}-month analytics plan`,
        quantity: 1,
        buyerName: user.name,
        buyerEmail: user.email ?? null,
        buyerPhone: user.phone ?? null,
        intentId: result.intentId,
        expiresAt: result.expiresAt,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout." };
  }
}

export async function verifyPremiumPaymentAction(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in." };
  const { verifyPayment } = await import("@/modules/shared/services/payments");
  const result = await verifyPayment(user, input);
  if (result.success) revalidatePath("/organizer");
  return { success: result.success, error: result.error };
}

export async function handlePremiumFailureAction(input: {
  razorpayOrderId: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };
  const { reportPaymentFailure } = await import("@/modules/shared/services/payments");
  const result = await reportPaymentFailure(user, input);
  if (result.success) revalidatePath("/organizer");
  return result;
}
