"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { createDoorStaffOrder, updateDoorStaffPaymentStatus } from "@/lib/data/door-staff";

export async function verifyDoorStaffPaymentAction(
  orderId: string,
  utrReference: string,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  if (!orderId) return { error: "Missing door staff order ID." };
  if (!utrReference.trim()) return { error: "Enter the UTR reference number." };

  try {
    await updateDoorStaffPaymentStatus(orderId, "PAID", utrReference.trim());
    revalidatePath("/organizer");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to verify payment." };
  }
}

export async function createDoorStaffOrderAction(
  eventId: string,
  staffCount: number,
  serviceAmountPaise: number,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  if (!eventId) return { error: "Missing event ID." };
  if (!staffCount || staffCount < 1) return { error: "Select at least 1 staff member." };

  try {
    await createDoorStaffOrder(user, eventId, staffCount, serviceAmountPaise);
    revalidatePath(`/organizer/events/${eventId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create door staff order." };
  }
}
