"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { createOrganizerProfile, updateOrganizerProfile } from "@/lib/data/organizer";

export interface CreateOrganizerState {
  error: string | null;
}

export interface UpdateOrganizerState {
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
  const description = String(formData.get("description") ?? "").trim();
  const upiId = String(formData.get("upiId") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim() || null;
  const coverUrl = String(formData.get("coverUrl") ?? "").trim() || null;
  const instagramUrl = String(formData.get("instagramUrl") ?? "").trim() || null;
  const panNumber = String(formData.get("panNumber") ?? "").trim().toUpperCase();
  const panName = String(formData.get("panName") ?? "").trim();
  const gstNumber = String(formData.get("gstNumber") ?? "").trim().toUpperCase();
  const gstBusinessName = String(formData.get("gstBusinessName") ?? "").trim();
  const bankAccountNumber = String(formData.get("bankAccountNumber") ?? "").trim();
  const bankIfsc = String(formData.get("bankIfsc") ?? "").trim().toUpperCase();
  const bankAccountName = String(formData.get("bankAccountName") ?? "").trim();
  const bankAccountType = String(formData.get("bankAccountType") ?? "SAVINGS").trim();
  const agreedToTerms = formData.get("agreedToTerms") === "true";

  if (!name) return { error: "Enter your organizer name." };
  if (!upiId) return { error: "Enter a UPI ID so attendees can pay you." };
  if (!panNumber) return { error: "Enter your PAN number." };
  if (!panName) return { error: "Enter the name as on your PAN card." };
  if (!bankAccountNumber) return { error: "Enter your bank account number." };
  if (!bankIfsc) return { error: "Enter your bank IFSC code." };
  if (!bankAccountName) return { error: "Enter the account holder name." };
  if (!agreedToTerms) return { error: "You must agree to the organizer terms." };

  // Basic PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    return { error: "PAN number format is invalid. Expected: ABCDE1234F" };
  }

  // Basic IFSC: 4 letters, 0, 6 alphanumeric
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc)) {
    return { error: "IFSC code format is invalid. Expected: ABCD0123456" };
  }

  try {
    await createOrganizerProfile(user, {
      name, bio, description, upiId, avatarUrl, coverUrl, instagramUrl,
      youtubeUrl: String(formData.get("youtubeUrl") ?? "").trim() || null,
      xUrl: String(formData.get("xUrl") ?? "").trim() || null,
      facebookUrl: String(formData.get("facebookUrl") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
      panNumber, panName,
      gstNumber, gstBusinessName,
      bankAccountNumber, bankIfsc, bankAccountName, bankAccountType,
      agreedToTerms,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create organizer profile.",
    };
  }

  revalidatePath("/organizer");
  redirect("/organizer");
}

export async function updateOrganizerAction(
  _prev: UpdateOrganizerState,
  formData: FormData,
): Promise<UpdateOrganizerState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const name = String(formData.get("name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const upiId = String(formData.get("upiId") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim() || null;
  const coverUrl = String(formData.get("coverUrl") ?? "").trim() || null;
  const instagramUrl = String(formData.get("instagramUrl") ?? "").trim() || null;
  const youtubeUrl = String(formData.get("youtubeUrl") ?? "").trim() || null;
  const xUrl = String(formData.get("xUrl") ?? "").trim() || null;
  const facebookUrl = String(formData.get("facebookUrl") ?? "").trim() || null;
  const linkedinUrl = String(formData.get("linkedinUrl") ?? "").trim() || null;
  const panNumber = String(formData.get("panNumber") ?? "").trim() || undefined;
  const panName = String(formData.get("panName") ?? "").trim() || undefined;
  const gstNumber = String(formData.get("gstNumber") ?? "").trim() || undefined;
  const gstBusinessName = String(formData.get("gstBusinessName") ?? "").trim() || undefined;
  const bankAccountNumber = String(formData.get("bankAccountNumber") ?? "").trim() || undefined;
  const bankIfsc = String(formData.get("bankIfsc") ?? "").trim() || undefined;
  const bankAccountName = String(formData.get("bankAccountName") ?? "").trim() || undefined;
  const bankAccountType = String(formData.get("bankAccountType") ?? "").trim() || undefined;

  if (!name) return { error: "Enter your organizer name." };
  if (!upiId) return { error: "Enter a UPI ID so attendees can pay you." };

  // Validate PAN format if provided
  if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    return { error: "PAN number format is invalid. Expected: ABCDE1234F" };
  }
  // Validate IFSC if provided
  if (bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc)) {
    return { error: "IFSC code format is invalid. Expected: ABCD0123456" };
  }

  try {
    await updateOrganizerProfile(user, {
      name, bio, description, upiId, avatarUrl, coverUrl, instagramUrl, youtubeUrl, xUrl, facebookUrl, linkedinUrl,
      panNumber, panName, gstNumber, gstBusinessName,
      bankAccountNumber, bankIfsc, bankAccountName, bankAccountType,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not update organizer profile.",
    };
  }

  revalidatePath("/organizer");
  return { error: null };
}
