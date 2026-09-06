"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  adminDeleteEvent,
  adminUpdateEvent,
  adminUpdateEventStatus,
  adminToggleEventFeatured,
  adminToggleUserAdmin,
} from "@/lib/data/admin";
import { updateSlotPrice } from "@/lib/data/boosts";
import { approveBoost, rejectBoost } from "@/lib/data/boosts";
import { setClubVerified } from "@/lib/data/clubs";
import { approveOrder, rejectOrder } from "@/lib/data/orders";
import { createClient } from "@/lib/supabase/server";
import type { EventStatus } from "@/lib/types";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_admin === true) return user;

  throw new Error("Not authorised.");
}

export async function adminDeleteEventAction(eventId: string): Promise<void> {
  await requireAdmin();
  await adminDeleteEvent(eventId);
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function adminUpdateEventStatusAction(
  eventId: string,
  status: EventStatus,
): Promise<void> {
  await requireAdmin();
  // If admin is cancelling an event, use the atomic cancel_event RPC
  // which processes refunds, cancels tickets, and sends notifications.
  if (status === "CANCELLED") {
    const supabase = await createClient();
    const { getCancellationChargePercent } = await import("@/lib/data/platform-settings");
    const cancellationChargePercent = await getCancellationChargePercent();
    const { error } = await supabase.rpc("cancel_event", {
      p_event_id: eventId,
      p_reason: "Event cancelled by admin.",
      p_cancellation_charge_percent: cancellationChargePercent,
    });
    if (error) throw new Error(error.message);
  } else {
    await adminUpdateEventStatus(eventId, status);
  }
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
}

export async function adminApproveOrderAction(orderId: string): Promise<void> {
  await requireAdmin();
  await approveOrder(orderId);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function adminRejectOrderAction(orderId: string, reason: string): Promise<void> {
  await requireAdmin();
  await rejectOrder(orderId, reason);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/tickets");
  revalidatePath("/");
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
  revalidatePath("/");
}

export async function adminToggleFeaturedAction(eventId: string, featured: boolean): Promise<void> {
  await requireAdmin();
  await adminToggleEventFeatured(eventId, featured);
  revalidatePath("/admin/events");
  revalidatePath("/");
}

export async function adminUpdateEventAction(
  eventId: string,
  data: {
    title?: string;
    description?: string;
    category?: EventStatus extends never ? never : string;
    city?: string;
    venueName?: string;
    venueAddress?: string;
    startsAt?: string;
    endsAt?: string;
  },
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminUpdateEvent(eventId, data as any);
    revalidatePath("/admin/events");
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update event." };
  }
}

export async function adminUpdateSlotPriceAction(slot: number, pricePaise: number): Promise<void> {
  await requireAdmin();
  await updateSlotPrice(slot, pricePaise);
  revalidatePath("/admin/boosts");
  revalidatePath("/organizer/boost");
}

export async function adminUpdateEventFeesAction(
  eventId: string,
  data: {
    commissionBps?: number;
    commissionEnabled?: boolean;
    convenienceFeeBps?: number;
    convenienceFeeEnabled?: boolean;
  },
  reason?: string,
): Promise<{ error: string | null }> {
  try {
    const user = await requireAdmin();
    const supabase = await createClient();

    // Fetch current values for audit log
    const { data: current } = await supabase
      .from("events")
      .select("commission_bps, commission_enabled, convenience_fee_bps, convenience_fee_enabled")
      .eq("id", eventId)
      .maybeSingle();

    // Build update object
    const update: Record<string, number | boolean> = {};
    const auditEntries: { field: string; oldVal: string; newVal: string }[] = [];

    if (data.commissionBps !== undefined && data.commissionBps !== current?.commission_bps) {
      update.commission_bps = data.commissionBps;
      auditEntries.push({ field: "commission_bps", oldVal: String(current?.commission_bps ?? ""), newVal: String(data.commissionBps) });
    }
    if (data.commissionEnabled !== undefined && data.commissionEnabled !== current?.commission_enabled) {
      update.commission_enabled = data.commissionEnabled;
      auditEntries.push({ field: "commission_enabled", oldVal: String(current?.commission_enabled ?? ""), newVal: String(data.commissionEnabled) });
    }
    if (data.convenienceFeeBps !== undefined && data.convenienceFeeBps !== current?.convenience_fee_bps) {
      update.convenience_fee_bps = data.convenienceFeeBps;
      auditEntries.push({ field: "convenience_fee_bps", oldVal: String(current?.convenience_fee_bps ?? ""), newVal: String(data.convenienceFeeBps) });
    }
    if (data.convenienceFeeEnabled !== undefined && data.convenienceFeeEnabled !== current?.convenience_fee_enabled) {
      update.convenience_fee_enabled = data.convenienceFeeEnabled;
      auditEntries.push({ field: "convenience_fee_enabled", oldVal: String(current?.convenience_fee_enabled ?? ""), newVal: String(data.convenienceFeeEnabled) });
    }

    if (Object.keys(update).length === 0) {
      return { error: null };
    }

    // Update the event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("events").update(update as any).eq("id", eventId);
    if (error) throw error;

    // Insert audit log entries
    for (const entry of auditEntries) {
      await supabase.from("admin_change_log").insert({
        admin_id: user.id,
        table_name: "events",
        entity_id: eventId,
        field_name: entry.field,
        old_value: entry.oldVal,
        new_value: entry.newVal,
        reason: reason ?? null,
      });
    }

    revalidatePath("/admin/events");
    revalidatePath(`/events/${eventId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update fees." };
  }
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
  revalidatePath("/clubs");
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
    revalidatePath("/");
    revalidatePath("/organizer/boost");
    revalidatePath("/checkout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update setting." };
  }
}
