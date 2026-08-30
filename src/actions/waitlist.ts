"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { joinWaitlist, leaveWaitlist } from "@/lib/data/waitlist";

export async function joinWaitlistAction(eventId: string, tierId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/events/${eventId}`);
  await joinWaitlist(user, eventId, tierId);
  revalidatePath(`/events/${eventId}`);
}

export async function leaveWaitlistAction(entryId: string, eventId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await leaveWaitlist(user, entryId);
  revalidatePath(`/events/${eventId}`);
}
