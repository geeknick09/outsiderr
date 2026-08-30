"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  adminDeleteEvent,
  adminUpdateEventStatus,
  adminToggleUserAdmin,
} from "@/lib/data/admin";
import { approveBoost, rejectBoost } from "@/lib/data/boosts";
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

  if (!profile?.is_admin) throw new Error("Not authorised.");
  return user;
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
