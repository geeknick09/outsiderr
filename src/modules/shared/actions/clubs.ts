"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../auth/auth";
import { createClub, joinClub, updateMemberStatus, type CreateClubInput } from "../data/clubs";
import { getOrganizerProfile } from "../data/organizer-profile";
import { City, ClubType, MembershipType } from "../lib/types";
import { normalizeCityKey } from "../lib/india-cities";

export interface CreateClubState {
  error: string | null;
}

export async function createClubAction(
  _prev: CreateClubState,
  formData: FormData,
): Promise<CreateClubState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fclubs%2Fcreate");

  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "Only organizers can create a club or crew." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give your club a name." };

  const membershipType = String(formData.get("membershipType") ?? "FREE") as MembershipType;
  const membershipFeePaise = Math.round(Number(formData.get("membershipFee") ?? 0) * 100);

  const upiId = String(formData.get("upiId") ?? "").trim();

  if (membershipType === "PAID" && membershipFeePaise <= 0) {
    return { error: "Paid membership needs a fee." };
  }
  if (membershipType === "PAID" && !upiId) {
    return { error: "Paid membership needs a UPI ID so members can pay." };
  }

  const terms = String(formData.get("terms") ?? "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const input: CreateClubInput = {
    name,
    bio: String(formData.get("bio") ?? "").trim(),
    type: String(formData.get("type") ?? "CLUB") as ClubType,
    city: String(formData.get("city") ?? "").trim()
      ? normalizeCityKey(String(formData.get("city")))
      : null,
    avatarUrl: String(formData.get("avatarUrl") ?? "").trim() || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
    instagramHandle: String(formData.get("instagramHandle") ?? "").trim() || null,
    upiId: membershipType === "PAID" ? upiId : null,
    membershipType,
    membershipFeePaise: membershipType === "PAID" ? membershipFeePaise : 0,
    terms,
  };

  try {
    await createClub(user, input);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create club.",
    };
  }

  revalidatePath("/clubs");
  redirect("/clubs?submitted=1");
}

export async function joinClubAction(
  clubId: string,
  options: { instagramLink?: string; utrReference?: string },
): Promise<{ memberId: string | null; status: "ACCEPTED" | "PENDING" }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const result = await joinClub(user, clubId, options);
  revalidatePath(`/clubs/${clubId}`);
  return result;
}

// ============================================================================
// RAZORPAY: paid club membership via the unified payment intent pipeline
// ============================================================================

export async function startClubCheckoutAction(
  memberId: string,
): Promise<{ session?: import("../lib/types").CheckoutSession; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to continue." };
  if (!memberId) return { error: "Missing membership." };

  const { startPayment } = await import("../services/payments");
  const { result, error } = await startPayment(user, {
    kind: "CLUB_MEMBERSHIP",
    refId: memberId,
    itemTitle: "Club membership",
  });
  if (error || !result) return { error: error ?? "Could not start payment." };

  return {
    session: {
      orderId: memberId,
      razorpayOrderId: result.razorpayOrderId,
      amountPaise: result.amountPaise,
      currency: "INR",
      keyId: result.keyId,
      eventTitle: "Club membership",
      tierName: "Membership",
      quantity: 1,
      buyerName: user.name,
      buyerEmail: user.email ?? null,
      buyerPhone: user.phone ?? null,
      intentId: result.intentId,
      expiresAt: result.expiresAt,
    },
  };
}

export async function verifyClubPaymentAction(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in." };
  const { verifyPayment } = await import("../services/payments");
  const result = await verifyPayment(user, input);
  if (result.success) revalidatePath("/clubs");
  return { success: result.success, error: result.error };
}

export async function handleClubFailureAction(input: {
  razorpayOrderId: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in to continue." };
  const { reportPaymentFailure } = await import("../services/payments");
  const result = await reportPaymentFailure(user, input);
  if (result.success) revalidatePath("/clubs");
  return result;
}

export async function acceptMemberAction(memberId: string, clubId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await updateMemberStatus(user, memberId, "ACCEPTED");
  revalidatePath("/organizer");
  revalidatePath(`/clubs/${clubId}`);
}

export async function rejectMemberAction(memberId: string, clubId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await updateMemberStatus(user, memberId, "REJECTED");
  revalidatePath("/organizer");
  revalidatePath(`/clubs/${clubId}`);
}
