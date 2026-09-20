import "server-only";

import { createClient } from "@/modules/shared/server";
import type { CurrentUser } from "@/modules/shared";
import { getOrganizerProfile } from "@/modules/shared/server";

export interface KycSubmission {
  id: string;
  organizerName: string;
  ownerEmail: string;
  ownerName: string | null;
  ownerPhone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  aboutText: string | null;
  organizerIntent: string | null;
  panNumber: string | null;
  panName: string | null;
  gstNumber: string | null;
  gstBusinessName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankAccountName: string | null;
  bankAccountType: string | null;
  upiId: string | null;
  kycStatus: string;
  kycSubmitted: boolean;
  kycReviewedAt: string | null;
  kycReviewNote: string | null;
  createdAt: string;
}

function splitOrganizerProfileDescription(raw: string | null): { aboutText: string | null; organizerIntent: string | null } {
  const parts = (raw ?? "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return { aboutText: null, organizerIntent: null };
  if (parts.length === 1) return { aboutText: parts[0], organizerIntent: null };

  return {
    aboutText: parts[0] ?? null,
    organizerIntent: parts.slice(1).join("\n\n") || null,
  };
}

/**
 * List all organizers with KYC status (admin only).
 * Filters by status filter if provided.
 */
export async function listKycSubmissions(statusFilter?: string): Promise<KycSubmission[]> {
  const supabase = await createClient();

  let query = supabase
    .from("organizers")
    .select(`
      id,
      name,
      bio,
      description,
      avatar_url,
      upi_id,
      pan_number,
      pan_name,
      gst_number,
      gst_business_name,
      bank_account_number,
      bank_ifsc,
      bank_account_name,
      bank_account_type,
      kyc_submitted,
      kyc_status,
      kyc_reviewed_at,
      kyc_review_note,
      created_at,
      owner_id
    `)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "ALL") {
    query = query.eq("kyc_status", statusFilter);
  } else if (!statusFilter) {
    // Default: show pending + clarification needed
    query = query.in("kyc_status", ["PENDING", "CLARIFICATION_NEEDED"]);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  // Fetch owner profile details separately
  const ownerIds = [...new Set(data.map((o) => o.owner_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .in("id", ownerIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return data.map((row) => {
    const profile = profileMap.get(row.owner_id);
    const { aboutText, organizerIntent } = splitOrganizerProfileDescription(row.description ?? null);
    return {
      id: row.id,
      organizerName: row.name,
      ownerEmail: (profile as { email?: string })?.email ?? "",
      ownerName: (profile as { full_name?: string })?.full_name ?? null,
      ownerPhone: (profile as { phone?: string })?.phone ?? null,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      aboutText,
      organizerIntent,
      panNumber: row.pan_number,
      panName: row.pan_name,
      gstNumber: row.gst_number,
      gstBusinessName: row.gst_business_name,
      bankAccountNumber: row.bank_account_number,
      bankIfsc: row.bank_ifsc,
      bankAccountName: row.bank_account_name,
      bankAccountType: row.bank_account_type,
      upiId: row.upi_id,
      kycStatus: row.kyc_status ?? "NOT_SUBMITTED",
      kycSubmitted: row.kyc_submitted ?? false,
      kycReviewedAt: row.kyc_reviewed_at,
      kycReviewNote: row.kyc_review_note,
      createdAt: row.created_at,
    };
  });
}

/**
 * Get a single KYC submission by organizer ID (admin only).
 */
export async function getKycSubmission(organizerId: string): Promise<KycSubmission | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizers")
    .select(`
      id,
      name,
      bio,
      description,
      avatar_url,
      upi_id,
      pan_number,
      pan_name,
      gst_number,
      gst_business_name,
      bank_account_number,
      bank_ifsc,
      bank_account_name,
      bank_account_type,
      kyc_submitted,
      kyc_status,
      kyc_reviewed_at,
      kyc_review_note,
      created_at,
      owner_id
    `)
    .eq("id", organizerId)
    .maybeSingle();

  if (error || !data) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", data.owner_id)
    .maybeSingle();

  const { aboutText, organizerIntent } = splitOrganizerProfileDescription(data.description ?? null);

  return {
    id: data.id,
    organizerName: data.name,
    ownerEmail: (profile as { email?: string })?.email ?? "",
    ownerName: (profile as { full_name?: string })?.full_name ?? null,
    ownerPhone: (profile as { phone?: string })?.phone ?? null,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    aboutText,
    organizerIntent,
    panNumber: data.pan_number,
    panName: data.pan_name,
    gstNumber: data.gst_number,
    gstBusinessName: data.gst_business_name,
    bankAccountNumber: data.bank_account_number,
    bankIfsc: data.bank_ifsc,
    bankAccountName: data.bank_account_name,
    bankAccountType: data.bank_account_type,
    upiId: data.upi_id,
    kycStatus: data.kyc_status ?? "NOT_SUBMITTED",
    kycSubmitted: data.kyc_submitted ?? false,
    kycReviewedAt: data.kyc_reviewed_at,
    kycReviewNote: data.kyc_review_note,
    createdAt: data.created_at,
  };
}

/**
 * Check if the current user's organizer profile has approved KYC.
 * Returns true if KYC is APPROVED, or if the organizer was created before
 * the KYC gate was added (backward compat — treat as approved).
 */
export async function isKycApproved(user: CurrentUser): Promise<boolean> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return false;
  // If kycStatus is not set on the profile (old organizers), allow access
  const status = organizer.kycStatus ?? "APPROVED";
  return status === "APPROVED";
}
