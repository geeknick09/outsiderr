"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { updateUserProfile } from "@/lib/data/profile";

export interface ProfileActionState {
  error: string | null;
  success: boolean;
}

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in.", success: false };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const instagramUrl = String(formData.get("instagramUrl") ?? "").trim() || null;
  const tags = formData.getAll("interestedTags").map(String);

  if (!fullName) return { error: "Name is required.", success: false };

  try {
    await updateUserProfile(user, {
      fullName,
      phone: phone || undefined,
      birthDate: birthDate || null,
      instagramUrl,
      interestedTags: tags,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save profile.",
      success: false,
    };
  }

  revalidatePath("/profile");
  return { error: null, success: true };
}
