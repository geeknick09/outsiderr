"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  adminDeleteEvent,
  adminUpdateEventStatus,
  adminToggleEventFeatured,
  adminToggleUserAdmin,
} from "@/lib/data/admin";
import { updateSlotPrice } from "@/lib/data/boosts";
import { approveBoost, rejectBoost } from "@/lib/data/boosts";
import { setClubVerified } from "@/lib/data/clubs";
import { approveOrder, rejectOrder } from "@/lib/data/orders";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { EventStatus } from "@/lib/types";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  // In demo mode every authenticated user is treated as admin.
  if (!isSupabaseConfigured()) return user;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  // If this user is explicitly admin, allow
  if (profile?.is_admin) return user;

  // Fallback: if no admin exists in the system yet, allow the first user
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true);
  if (count === 0) return user;

  throw new Error("Not authorised.");
}

export async function adminDeleteEventAction(eventId: string): Promise<void> {
  await requireAdmin();
  await adminDeleteEvent(eventId);
  revalidatePath("/admin/events");
  revalidatePath("/");
}

export async function adminUpdateEventStatusAction(
  eventId: string,
  status: EventStatus,
): Promise<void> {
  await requireAdmin();
  await adminUpdateEventStatus(eventId, status);
  revalidatePath("/admin/events");
}

export async function adminApproveOrderAction(orderId: string): Promise<void> {
  await requireAdmin();
  await approveOrder(orderId);
  revalidatePath("/admin/orders");
}

export async function adminRejectOrderAction(orderId: string, reason: string): Promise<void> {
  await requireAdmin();
  await rejectOrder(orderId, reason);
  revalidatePath("/admin/orders");
}

export async function adminApproveBoostAction(boostId: string): Promise<void> {
  await requireAdmin();
  await approveBoost(boostId);
  revalidatePath("/admin/boosts");
  revalidatePath("/");
}

export async function adminRejectBoostAction(boostId: string): Promise<void> {
  await requireAdmin();
  await rejectBoost(boostId);
  revalidatePath("/admin/boosts");
}

export async function adminToggleAdminAction(userId: string, isAdmin: boolean): Promise<void> {
  await requireAdmin();
  await adminToggleUserAdmin(userId, isAdmin);
  revalidatePath("/admin/users");
}

export async function adminToggleFeaturedAction(eventId: string, featured: boolean): Promise<void> {
  await requireAdmin();
  await adminToggleEventFeatured(eventId, featured);
  revalidatePath("/admin/events");
  revalidatePath("/");
}

export async function adminUpdateSlotPriceAction(slot: number, pricePaise: number): Promise<void> {
  await requireAdmin();
  await updateSlotPrice(slot, pricePaise);
  revalidatePath("/admin/boosts");
  revalidatePath("/organizer/boost");
}

export async function adminApproveClubAction(clubId: string): Promise<void> {
  await requireAdmin();
  await setClubVerified(clubId, true);
  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
}

export async function adminRejectClubAction(clubId: string): Promise<void> {
  await requireAdmin();
  await setClubVerified(clubId, false);
  revalidatePath("/admin/clubs");
}

export async function updatePlatformSettingAction(
  key: string,
  value: string,
): Promise<{ error: string | null }> {
  const user = await requireAdmin();
  if (!key) return { error: "Setting key is required." };

  try {
    // Try to parse as JSON for object/number values, otherwise keep as string
    let parsedValue: string | number | boolean | Record<string, number>;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }

    const { updateSetting } = await import("@/lib/data/platform-settings");
    await updateSetting(user.id, key, parsedValue);
    revalidatePath("/admin/settings");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update setting." };
  }
}
