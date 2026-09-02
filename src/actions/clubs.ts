"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import {
  createClub,
  joinClub,
  updateMemberStatus,
  type CreateClubInput,
} from "@/lib/data/clubs";
import { getOrganizerProfile } from "@/lib/data/organizer";
import type { City, ClubType, MembershipType } from "@/lib/types";

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
    city: (String(formData.get("city") ?? "") || null) as City | null,
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
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await joinClub(user, clubId, options);
  revalidatePath(`/clubs/${clubId}`);
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
