"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/shared/server";
import { createDoorStaffOrder, submitDoorStaffUtr, notifyAdmins } from "@/modules/shared/server";

export async function verifyDoorStaffPaymentAction(
  orderId: string,
  utrReference: string,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  if (!orderId) return { error: "Missing door staff order ID." };
  if (!utrReference.trim()) return { error: "Enter the UTR reference number." };

  try {
    // Records the UTR for admin verification — does NOT mark the order paid.
    await submitDoorStaffUtr(orderId, utrReference.trim());
    await notifyAdmins({
      type: "DOOR_STAFF_REQUESTED",
      message: `Door staff payment submitted (UTR ${utrReference.trim()}) — pending verification.`,
    });
    revalidatePath("/organizer");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit payment reference." };
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
    // Price is derived server-side from door_staff_pricing — the client's
    // serviceAmountPaise is ignored.
    await createDoorStaffOrder(user, eventId, staffCount);
    revalidatePath(`/organizer/events/${eventId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create door staff order." };
  }
}
