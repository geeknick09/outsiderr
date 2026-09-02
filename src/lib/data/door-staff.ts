import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type { DoorStaffOrder, DoorStaffPaymentStatus, DoorStaffServiceStatus } from "@/lib/types";

function mapRow(row: {
  id: string;
  event_id: string;
  organizer_id: string;
  number_of_staff: number;
  service_amount_paise: number;
  payment_status: string;
  service_status: string;
  utr_reference: string | null;
  created_at: string;
  updated_at: string;
}): DoorStaffOrder {
  return {
    id: row.id,
    eventId: row.event_id,
    organizerId: row.organizer_id,
    numberOfStaff: row.number_of_staff,
    serviceAmountPaise: row.service_amount_paise,
    paymentStatus: row.payment_status as DoorStaffPaymentStatus,
    serviceStatus: row.service_status as DoorStaffServiceStatus,
    utrReference: row.utr_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createDoorStaffOrder(
  user: CurrentUser,
  eventId: string,
  numberOfStaff: number,
  serviceAmountPaise: number,
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    // Demo mode: store in-memory
    const { demoStore } = await import("@/lib/data/demo-store");
    const store = demoStore();
    const id = `ds-${Date.now()}`;
    const now = new Date().toISOString();
    store.doorStaffOrders.push({
      id,
      eventId,
      organizerId: user.id,
      numberOfStaff,
      serviceAmountPaise,
      paymentStatus: "PENDING",
      serviceStatus: "REQUESTED",
      utrReference: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  const { getOrganizerProfile } = await import("@/lib/data/organizer");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("door_staff_orders")
    .insert({
      event_id: eventId,
      organizer_id: organizer.id,
      number_of_staff: numberOfStaff,
      service_amount_paise: serviceAmountPaise,
      payment_status: "PENDING",
      service_status: "REQUESTED",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

export async function getDoorStaffOrder(
  eventId: string,
): Promise<DoorStaffOrder | null> {
  if (!isSupabaseConfigured()) {
    const { demoStore } = await import("@/lib/data/demo-store");
    return demoStore().doorStaffOrders.find((o) => o.eventId === eventId) ?? null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("door_staff_orders")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

export async function updateDoorStaffPaymentStatus(
  orderId: string,
  paymentStatus: DoorStaffPaymentStatus,
  utrReference?: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const { demoStore } = await import("@/lib/data/demo-store");
    const store = demoStore();
    const order = store.doorStaffOrders.find((o) => o.id === orderId);
    if (order) {
      order.paymentStatus = paymentStatus;
      order.updatedAt = new Date().toISOString();
      if (paymentStatus === "PAID") order.serviceStatus = "CONFIRMED";
      if (utrReference !== undefined) order.utrReference = utrReference;
    }
    return;
  }

  const supabase = await createClient();
  const update: {
    payment_status: DoorStaffPaymentStatus;
    updated_at: string;
    service_status?: DoorStaffServiceStatus;
    utr_reference?: string;
  } = {
    payment_status: paymentStatus,
    updated_at: new Date().toISOString(),
  };

  // If payment is confirmed, also update service status
  if (paymentStatus === "PAID") {
    update.service_status = "CONFIRMED";
  }
  if (utrReference !== undefined) {
    update.utr_reference = utrReference;
  }

  const { error } = await supabase
    .from("door_staff_orders")
    .update(update)
    .eq("id", orderId);

  if (error) throw error;
}

export async function listAllDoorStaffOrders(): Promise<DoorStaffOrder[]> {
  if (!isSupabaseConfigured()) {
    const { demoStore } = await import("@/lib/data/demo-store");
    return [...demoStore().doorStaffOrders].reverse();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("door_staff_orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(mapRow);
}

export async function updateDoorStaffServiceStatus(
  orderId: string,
  serviceStatus: DoorStaffServiceStatus,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("door_staff_orders")
    .update({
      service_status: serviceStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) throw error;
}
