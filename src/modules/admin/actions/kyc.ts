"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/modules/shared/server";
import { createClient, createServiceClient, sendNotification, addKycMessage } from "@/modules/shared/server";

export interface KycReviewResult {
  error: string | null;
  success: boolean;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_admin === true) return user;

  throw new Error("Not authorised.");
}

/**
 * Approve a KYC submission. Sets kyc_status = APPROVED, verified = true.
 * Sends a notification to the organizer.
 */
export async function approveKycAction(organizerId: string): Promise<KycReviewResult> {
  let admin: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "Admin access required.", success: false };
  }

  const supabase = await createClient();
  const service = createServiceClient();

  // Update organizer KYC status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (service.from("organizers") as any)
    .update({
      kyc_status: "APPROVED",
      kyc_reviewed_at: new Date().toISOString(),
      kyc_review_note: null,
      verified: true,
      rejection_count: 0,
    })
    .eq("id", organizerId);

  if (updateError) return { error: updateError.message, success: false };

  // Get the organizer's owner_id to send notification
  const { data: org } = await supabase
    .from("organizers")
    .select("owner_id, name")
    .eq("id", organizerId)
    .maybeSingle();

  if (org?.owner_id) {
    // Insert notification
    await sendNotification(
      {
        userId: org.owner_id,
        type: "KYC_APPROVED",
        message: `Congratulations! Your organizer profile has been approved. You can now publish events and manage your dashboard.`,
      },
      supabase,
    );
  }
  await addKycMessage(organizerId, "admin", admin?.email ?? null, "Application approved.");

  revalidatePath("/admin/kyc", "page");
  revalidatePath("/organizer", "page");
  return { error: null, success: true };
}

/**
 * Reject a KYC submission. Sets kyc_status = REJECTED.
 * Sends a notification with the review note.
 */
export async function rejectKycAction(organizerId: string, note: string): Promise<KycReviewResult> {
  let admin: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "Admin access required.", success: false };
  }

  if (!note.trim()) return { error: "Please provide a reason for rejection.", success: false };

  const supabase = await createClient();
  const service = createServiceClient();

  const { data: organizer } = await supabase
    .from("organizers")
    .select("rejection_count, owner_id, name")
    .eq("id", organizerId)
    .maybeSingle();

  const nextRejectionCount = Math.max(0, Number(organizer?.rejection_count ?? 0) + 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (service.from("organizers") as any)
    .update({
      kyc_status: "REJECTED",
      kyc_reviewed_at: new Date().toISOString(),
      kyc_review_note: note.trim(),
      verified: false,
      rejection_count: nextRejectionCount,
    })
    .eq("id", organizerId);

  if (updateError) return { error: updateError.message, success: false };

  const { data: org } = await supabase
    .from("organizers")
    .select("owner_id, name")
    .eq("id", organizerId)
    .maybeSingle();

  if (org?.owner_id) {
    await sendNotification(
      {
        userId: org.owner_id,
        type: "KYC_REJECTED",
        message: `Your organizer application was not approved. Reason: ${note.trim()}`,
      },
      supabase,
    );
  }
  await addKycMessage(organizerId, "admin", admin?.email ?? null, `Rejected: ${note.trim()}`);

  revalidatePath("/admin/kyc", "page");
  revalidatePath("/organizer", "page");
  return { error: null, success: true };
}

/**
 * Request clarification. Sets kyc_status = CLARIFICATION_NEEDED.
 * Sends a notification telling the organizer an Outsiderr member will contact them.
 */
export async function requestClarificationAction(organizerId: string, note: string): Promise<KycReviewResult> {
  let admin: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "Admin access required.", success: false };
  }

  if (!note.trim()) return { error: "Please provide what clarification is needed.", success: false };

  const supabase = await createClient();
  const service = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (service.from("organizers") as any)
    .update({
      kyc_status: "CLARIFICATION_NEEDED",
      kyc_reviewed_at: new Date().toISOString(),
      kyc_review_note: note.trim(),
    })
    .eq("id", organizerId);

  if (updateError) return { error: updateError.message, success: false };

  const { data: org } = await supabase
    .from("organizers")
    .select("owner_id, name")
    .eq("id", organizerId)
    .maybeSingle();

  if (org?.owner_id) {
    await sendNotification(
      {
        userId: org.owner_id,
        type: "KYC_CLARIFICATION",
        message: `Your organizer application needs clarification. Please open your organizer dashboard and respond to the review note. Note: ${note.trim()}`,
      },
      supabase,
    );
  }
  await addKycMessage(organizerId, "admin", admin?.email ?? null, `Clarification requested: ${note.trim()}`);

  revalidatePath("/admin/kyc", "page");
  revalidatePath("/organizer", "page");
  return { error: null, success: true };
}

/**
 * Approve staged KYC/payout changes on an APPROVED organizer — applies the
 * pending_kyc values to the real columns and clears the stage. The organizer
 * stays approved throughout; only the new data was gated.
 */
export async function approveKycChangeAction(organizerId: string): Promise<KycReviewResult> {
  let admin: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "Admin access required.", success: false };
  }

  const supabase = await createClient();
  const service = createServiceClient();

  const { data: org } = await supabase
    .from("organizers")
    .select("owner_id, name, pending_kyc")
    .eq("id", organizerId)
    .maybeSingle();

  const pending = (org as { pending_kyc?: Record<string, string | null> | null } | null)?.pending_kyc;
  if (!pending || Object.keys(pending).length === 0) {
    return { error: "No pending changes to approve.", success: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (service.from("organizers") as any)
    .update({
      ...pending,
      pending_kyc: null,
      kyc_reviewed_at: new Date().toISOString(),
    })
    .eq("id", organizerId);

  if (updateError) return { error: updateError.message, success: false };

  if (org?.owner_id) {
    await sendNotification(
      {
        userId: org.owner_id,
        type: "KYC_APPROVED",
        message: `Your requested KYC/payout changes were approved and are now live.`,
        channels: ["in-app", "email"],
      },
      supabase,
    );
  }
  await addKycMessage(organizerId, "admin", admin?.email ?? null, "Profile changes approved and applied.");

  revalidatePath("/admin/kyc", "page");
  revalidatePath("/organizer", "page");
  return { error: null, success: true };
}

/**
 * Reject staged KYC/payout changes — clears pending_kyc so the previously
 * verified details remain authoritative. Organizer is told why and directed
 * to re-edit or contact support.
 */
export async function rejectKycChangeAction(organizerId: string, note: string): Promise<KycReviewResult> {
  let admin: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "Admin access required.", success: false };
  }

  if (!note.trim()) return { error: "Please provide a reason for rejecting the changes.", success: false };

  const supabase = await createClient();
  const service = createServiceClient();

  const { data: org } = await supabase
    .from("organizers")
    .select("owner_id, name, pending_kyc")
    .eq("id", organizerId)
    .maybeSingle();

  const pending = (org as { pending_kyc?: Record<string, string | null> | null } | null)?.pending_kyc;
  if (!pending || Object.keys(pending).length === 0) {
    return { error: "No pending changes to reject.", success: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (service.from("organizers") as any)
    .update({
      pending_kyc: null,
      kyc_reviewed_at: new Date().toISOString(),
    })
    .eq("id", organizerId);

  if (updateError) return { error: updateError.message, success: false };

  if (org?.owner_id) {
    await sendNotification(
      {
        userId: org.owner_id,
        type: "KYC_REJECTED",
        message: `Your requested KYC/payout changes were not approved. Reason: ${note.trim()}. Your previously verified details remain active — you can edit again or contact Outsiderr support.`,
        channels: ["in-app", "email"],
      },
      supabase,
    );
  }
  await addKycMessage(organizerId, "admin", admin?.email ?? null, `Change request rejected: ${note.trim()}`);

  revalidatePath("/admin/kyc", "page");
  revalidatePath("/organizer", "page");
  return { error: null, success: true };
}
