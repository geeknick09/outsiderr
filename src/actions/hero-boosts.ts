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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Check if the current user is an admin.
 * Mirrors the requireAdmin() logic from src/actions/admin.ts, including
 * the fallback that allows the first user when no admin exists yet.
 */
async function checkAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (!isSupabaseConfigured()) return true; // Demo mode: everyone is admin

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_admin) return true;

  // Fallback: if no admin exists in the system yet, allow any authenticated user
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true);
  return count === 0;
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

export { getHeroBoostForEvent };
