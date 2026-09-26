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
  panDocumentUrl: string | null;
  bankDocumentUrl: string | null;
  kycResponseNote: string | null;
  kycStatus: string;
  kycSubmitted: boolean;
  kycReviewedAt: string | null;
  kycReviewNote: string | null;
  /** Staged KYC/payout edits awaiting re-verification (column → new value). */
  pendingKyc: Record<string, string | null> | null;
  thread: KycThreadMessage[];
  createdAt: string;
}

export interface KycThreadMessage {
  senderRole: "admin" | "organizer" | "system";
  senderEmail: string | null;
  message: string;
  createdAt: string;
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
      organizer_intent,
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
      pan_document_url,
      bank_document_url,
      kyc_response_note,
      kyc_submitted,
      kyc_status,
      kyc_reviewed_at,
      kyc_review_note,
      pending_kyc,
      created_at,
      owner_id
    `)
    .order("created_at", { ascending: false });

  if (statusFilter === "CHANGES") {
    // Approved organizers with staged KYC/payout edits awaiting re-verification
    query = query.not("pending_kyc", "is", null);
  } else if (statusFilter && statusFilter !== "ALL") {
    query = query.eq("kyc_status", statusFilter);
  } else if (!statusFilter) {
    // Default queue: pending + clarification + staged change requests
    query = query.or("kyc_status.in.(PENDING,CLARIFICATION_NEEDED),pending_kyc.not.is.null");
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

  // KYC message threads for all listed organizers (one batched query)
  const orgIds = data.map((o) => o.id);
  const { data: msgRows } = await supabase
    .from("kyc_messages")
    .select("organizer_id, sender_role, sender_email, message, created_at")
    .in("organizer_id", orgIds)
    .order("created_at", { ascending: true });
  const threadMap = new Map<string, KycThreadMessage[]>();
  for (const m of msgRows ?? []) {
    const list = threadMap.get(m.organizer_id) ?? [];
    list.push({
      senderRole: m.sender_role,
      senderEmail: m.sender_email,
      message: m.message,
      createdAt: m.created_at,
    });
    threadMap.set(m.organizer_id, list);
  }

  return data.map((row) => {
    const profile = profileMap.get(row.owner_id);
    const aboutText = row.description;
    const organizerIntent = row.organizer_intent;
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
      panDocumentUrl: row.pan_document_url ?? null,
      bankDocumentUrl: row.bank_document_url ?? null,
      kycResponseNote: row.kyc_response_note ?? null,
      kycStatus: row.kyc_status ?? "NOT_SUBMITTED",
      kycSubmitted: row.kyc_submitted ?? false,
      kycReviewedAt: row.kyc_reviewed_at,
      kycReviewNote: row.kyc_review_note,
      pendingKyc: (row as { pending_kyc?: Record<string, string | null> | null }).pending_kyc ?? null,
      thread: threadMap.get(row.id) ?? [],
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
      organizer_intent,
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
      pan_document_url,
      bank_document_url,
      kyc_response_note,
      kyc_submitted,
      kyc_status,
      kyc_reviewed_at,
      kyc_review_note,
      pending_kyc,
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

  const aboutText = data.description;
  const organizerIntent = data.organizer_intent;

  const { data: msgRows } = await supabase
    .from("kyc_messages")
    .select("sender_role, sender_email, message, created_at")
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: true });
  const thread: KycThreadMessage[] = (msgRows ?? []).map((m) => ({
    senderRole: m.sender_role,
    senderEmail: m.sender_email,
    message: m.message,
    createdAt: m.created_at,
  }));

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
    panDocumentUrl: data.pan_document_url ?? null,
    bankDocumentUrl: data.bank_document_url ?? null,
    kycResponseNote: data.kyc_response_note ?? null,
    kycStatus: data.kyc_status ?? "NOT_SUBMITTED",
    kycSubmitted: data.kyc_submitted ?? false,
    kycReviewedAt: data.kyc_reviewed_at,
    kycReviewNote: data.kyc_review_note,
    pendingKyc: (data as { pending_kyc?: Record<string, string | null> | null }).pending_kyc ?? null,
    thread,
    createdAt: data.created_at,
  };
}

/** Per-status submission counts for the filter tabs. */
export async function listKycCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizers")
    .select("kyc_status, pending_kyc");
  const counts: Record<string, number> = { PENDING: 0, CLARIFICATION_NEEDED: 0, APPROVED: 0, REJECTED: 0, CHANGES: 0 };
  for (const row of data ?? []) {
    const s = row.kyc_status ?? "NOT_SUBMITTED";
    if (s in counts) counts[s]++;
    if ((row as { pending_kyc?: unknown }).pending_kyc) counts.CHANGES++;
  }
  counts.ALL = data?.length ?? 0;
  return counts;
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
