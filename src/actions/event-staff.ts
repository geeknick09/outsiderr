"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import {
  addEventStaff,
  removeEventStaff,
} from "@/lib/data/event-staff";

export async function addEventStaffAction(
  eventId: string,
  email: string,
  phone: string,
  displayName: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  console.log(`[event-staff] addEventStaffAction: eventId=${eventId}, email=${email || "null"}, phone=${phone || "null"}, name=${displayName}, byUser=${user.id}`);

  try {
    const result = await addEventStaff(
      user,
      eventId,
      email.trim() || null,
      phone.trim() || null,
      displayName.trim() || (email || phone),
    );

    if (result.success) {
      console.log(`[event-staff] Staff added successfully: eventId=${eventId}, email=${email || "null"}, phone=${phone || "null"}`);
      revalidatePath(`/organizer/events/${eventId}`);
    } else {
      console.warn(`[event-staff] Staff add failed: eventId=${eventId}, error=${result.error}`);
    }

    return result;
  } catch (err) {
    console.error(`[event-staff] addEventStaffAction error: eventId=${eventId}, error=`, err);
    return { success: false, error: "Failed to add door staff." };
  }
}

export async function removeEventStaffAction(
  eventId: string,
  staffId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  console.log(`[event-staff] removeEventStaffAction: eventId=${eventId}, staffId=${staffId}, byUser=${user.id}`);

  try {
    const result = await removeEventStaff(user, staffId);

    if (result.success) {
      console.log(`[event-staff] Staff removed successfully: eventId=${eventId}, staffId=${staffId}`);
      revalidatePath(`/organizer/events/${eventId}`);
    } else {
      console.warn(`[event-staff] Staff remove failed: eventId=${eventId}, staffId=${staffId}, error=${result.error}`);
    }

    return result;
  } catch (err) {
    console.error(`[event-staff] removeEventStaffAction error: eventId=${eventId}, staffId=${staffId}, error=`, err);
    return { success: false, error: "Failed to remove door staff." };
  }
}
