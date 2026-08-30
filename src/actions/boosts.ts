"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { requestBoost } from "@/lib/data/boosts";
import { getOrganizerProfile } from "@/lib/data/organizer";

export interface RequestBoostInput {
  eventId: string;
  slot: number;
  amountPaidPaise: number;
  startsAt: string;
  endsAt: string;
  utrReference: string;
}

export async function requestBoostAction(input: RequestBoostInput): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer%2Fboost");

  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("Create an organizer profile first.");

  if (!input.eventId) throw new Error("Select an event.");
  if (!input.slot || input.slot < 1 || input.slot > 10) throw new Error("Invalid slot.");
  if (!input.utrReference.trim()) throw new Error("Enter your UTR reference.");

  await requestBoost(user, {
    eventId: input.eventId,
    organizerId: organizer.id,
    slot: input.slot,
    amountPaidPaise: input.amountPaidPaise,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    utrReference: input.utrReference.trim(),
  });

  revalidatePath("/organizer/boost");
  revalidatePath("/admin/boosts");
}
