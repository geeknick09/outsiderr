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
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const instagramUrl = String(formData.get("instagramUrl") ?? "").trim() || null;
  const youtubeUrl = String(formData.get("youtubeUrl") ?? "").trim() || null;
  const xUrl = String(formData.get("xUrl") ?? "").trim() || null;
  const facebookUrl = String(formData.get("facebookUrl") ?? "").trim() || null;
  const linkedinUrl = String(formData.get("linkedinUrl") ?? "").trim() || null;
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim() || null;
  const tags = formData.getAll("interestedTags").map(String);

  if (!fullName) return { error: "Name is required.", success: false };

  // Server-side: reject future birthdate (mobile browsers don't enforce max)
  if (birthDate) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const selected = new Date(birthDate + "T00:00:00");
    if (selected > today) {
      return { error: "Birthdate cannot be in the future.", success: false };
    }
  }

  try {
    await updateUserProfile(user, {
      fullName,
      phone: phone || undefined,
      birthDate: birthDate || null,
      gender,
      instagramUrl,
      youtubeUrl,
      xUrl,
      facebookUrl,
      linkedinUrl,
      avatarUrl: avatarUrl || undefined,
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
