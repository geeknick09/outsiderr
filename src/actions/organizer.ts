"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { createOrganizerProfile } from "@/lib/data/organizer";

export interface CreateOrganizerState {
  error: string | null;
}

export async function createOrganizerAction(
  _prev: CreateOrganizerState,
  formData: FormData,
): Promise<CreateOrganizerState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const name = String(formData.get("name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const upiId = String(formData.get("upiId") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim() || null;

  if (!name) return { error: "Enter your organizer name." };
  if (!upiId) return { error: "Enter a UPI ID so attendees can pay you." };

  try {
    await createOrganizerProfile(user, { name, bio, upiId, avatarUrl });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create organizer profile.",
    };
  }

  revalidatePath("/organizer");
  redirect("/organizer");
}
