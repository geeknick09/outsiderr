import "server-only";

import { createClient } from "../auth/server";
import { createServiceClient } from "../auth/service";
import type { CurrentUser } from "../auth/auth";
import { mergeOrganizerIntent } from "../lib/event-lifecycle";
import type { Database } from "../db/database.types";
import type { Organizer } from "../lib/types";

export async function getOrganizerProfile(
  user: CurrentUser,
): Promise<Organizer | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizers")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    ownerId: (data as { owner_id?: string }).owner_id ?? "",
    name: data.name,
    bio: data.bio,
    description: (data as { description?: string | null }).description ?? null,
    avatarUrl: data.avatar_url,
    coverUrl: (data as { cover_url?: string | null }).cover_url ?? null,
    instagramUrl: (data as { instagram_url?: string | null }).instagram_url ?? null,
    youtubeUrl: (data as { youtube_url?: string | null }).youtube_url ?? null,
    xUrl: (data as { x_url?: string | null }).x_url ?? null,
    facebookUrl: (data as { facebook_url?: string | null }).facebook_url ?? null,
    linkedinUrl: (data as { linkedin_url?: string | null }).linkedin_url ?? null,
    upiId: data.upi_id,
    upiQrUrl: data.upi_qr_url,
    verified: data.verified,
    panNumber: (data as { pan_number?: string | null }).pan_number ?? null,
    panName: (data as { pan_name?: string | null }).pan_name ?? null,
    panDocumentUrl: (data as { pan_document_url?: string | null }).pan_document_url ?? null,
    gstNumber: (data as { gst_number?: string | null }).gst_number ?? null,
    gstBusinessName: (data as { gst_business_name?: string | null }).gst_business_name ?? null,
    bankAccountNumber: (data as { bank_account_number?: string | null }).bank_account_number ?? null,
    bankIfsc: (data as { bank_ifsc?: string | null }).bank_ifsc ?? null,
    bankAccountName: (data as { bank_account_name?: string | null }).bank_account_name ?? null,
    bankAccountType: (data as { bank_account_type?: string | null }).bank_account_type ?? null,
    bankDocumentUrl: (data as { bank_document_url?: string | null }).bank_document_url ?? null,
    rejectionCount: Number((data as { rejection_count?: number | null }).rejection_count ?? 0),
    kycStatus: (data as { kyc_status?: string }).kyc_status ?? "NOT_SUBMITTED",
    kycReviewedAt: (data as { kyc_reviewed_at?: string | null }).kyc_reviewed_at ?? null,
    kycReviewNote: (data as { kyc_review_note?: string | null }).kyc_review_note ?? null,
    kycResponseNote: (data as { kyc_response_note?: string | null }).kyc_response_note ?? null,
    kycResponseDocumentUrl: (data as { kyc_response_document_url?: string | null }).kyc_response_document_url ?? null,
  };
}

export async function createOrganizerProfile(
  user: CurrentUser,
  input: CreateOrganizerInput,
): Promise<string> {
  // If the user already has a profile: approved → return its id as-is;
  // rejected/pending → overwrite all fields (the wizard is the resubmit path).
  const existing = await getOrganizerProfile(user);
  if (existing) {
    if (existing.kycStatus === "APPROVED") return existing.id;
    const merged = mergeOrganizerIntent(input.description ?? "", input.organizerIntent ?? "");
    const resubmit = {
      name: input.name,
      bio: input.bio || null,
      description: merged || null,
      upi_id: input.upiId || null,
      avatar_url: input.avatarUrl,
      cover_url: input.coverUrl,
      instagram_url: input.instagramUrl,
      youtube_url: input.youtubeUrl,
      x_url: input.xUrl,
      facebook_url: input.facebookUrl,
      linkedin_url: input.linkedinUrl,
      pan_number: input.panNumber || null,
      pan_name: input.panName || null,
      pan_document_url: input.panDocumentUrl || null,
      gst_number: input.gstNumber || null,
      gst_business_name: input.gstBusinessName || null,
      bank_account_number: input.bankAccountNumber || null,
      bank_ifsc: input.bankIfsc || null,
      bank_account_name: input.bankAccountName || null,
      bank_account_type: input.bankAccountType || null,
      bank_document_url: input.bankDocumentUrl || null,
      kyc_submitted: !!(input.panNumber && input.bankAccountNumber),
      kyc_status: (input.panNumber && input.bankAccountNumber) ? "PENDING" : "NOT_SUBMITTED",
      // Fresh application clears the previous response fields (rejection_count
      // is preserved — it feeds the block limit).
      kyc_response_note: null,
      kyc_response_document_url: null,
      kyc_reviewed_at: null,
    };
    const supabase2 = await createClient();
    const { error } = await supabase2.from("organizers").update(resubmit).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const supabase = await createClient();
  // Single atomic INSERT with all fields — KYC included — so no partial profile is
  // left behind if the database is missing columns from an unapplied migration.
  const mergedDescription = mergeOrganizerIntent(input.description ?? "", input.organizerIntent ?? "");

  const organizerInsert = {
    owner_id: user.id,
    name: input.name,
    bio: input.bio || null,
    description: mergedDescription || null,
    upi_id: input.upiId || null,
    avatar_url: input.avatarUrl,
    cover_url: input.coverUrl,
    instagram_url: input.instagramUrl,
    youtube_url: input.youtubeUrl,
    x_url: input.xUrl,
    facebook_url: input.facebookUrl,
    linkedin_url: input.linkedinUrl,
    // KYC / payout fields — included here so the insert is atomic.
    // If any of these columns are missing (unapplied migration), the whole
    // INSERT fails cleanly and no orphaned partial profile is created.
    pan_number: input.panNumber || null,
    pan_name: input.panName || null,
    pan_document_url: input.panDocumentUrl || null,
    gst_number: input.gstNumber || null,
    gst_business_name: input.gstBusinessName || null,
    bank_account_number: input.bankAccountNumber || null,
    bank_ifsc: input.bankIfsc || null,
    bank_account_name: input.bankAccountName || null,
    bank_account_type: input.bankAccountType || null,
    bank_document_url: input.bankDocumentUrl || null,
    rejection_count: 0,
    kyc_submitted: !!(input.panNumber && input.bankAccountNumber),
    kyc_status: (input.panNumber && input.bankAccountNumber) ? "PENDING" : "NOT_SUBMITTED",
  } satisfies Record<string, string | boolean | number | null>;

  const { data, error } = await supabase
    .from("organizers")
    .insert(organizerInsert)
    .select("id")
    .single();

  if (error) {
    console.error("createOrganizerProfile insert error:", error);
    throw error;
  }
  if (!data?.id) throw new Error("Failed to create organizer profile — no ID returned.");

  // Only flip is_organizer flag if KYC is approved (or no KYC needed yet —
  // for backward compat, we still set it so existing organizers aren't locked out).
  // The dashboard will gate access behind kyc_status = APPROVED.
  // is_organizer is a privileged column (revoked from authenticated UPDATE)
  // — write via service role after the organizer row exists.
  const { error: profileError } = await createServiceClient()
    .from("profiles")
    .update({ is_organizer: true })
    .eq("id", user.id);
  if (profileError) {
    console.error("Failed to set is_organizer flag:", profileError);
    // Non-fatal — organizer profile is created, flag can be set later
  }

  return data.id;
}

export interface UpdateOrganizerInput {
  name?: string;
  bio?: string;
  description?: string;
  organizerIntent?: string;
  upiId?: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  xUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
  panNumber?: string;
  panName?: string;
  panDocumentUrl?: string | null;
  gstNumber?: string;
  gstBusinessName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankAccountName?: string;
  bankAccountType?: string;
  bankDocumentUrl?: string | null;
  kycResponseNote?: string | null;
  kycResponseDocumentUrl?: string | null;
}

/** Updates an organizer's profile (name, bio, UPI ID, avatar, cover, social, KYC). */
export async function updateOrganizerProfile(
  user: CurrentUser,
  input: UpdateOrganizerInput,
): Promise<void> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("No organizer profile found.");

  const supabase = await createClient();
  const mergedDescription = input.description !== undefined || input.organizerIntent !== undefined
    ? mergeOrganizerIntent(input.description ?? "", input.organizerIntent ?? "")
    : undefined;
  // Partial update — only fields present in the input are written, so a PATCH
  // that omits name/upiId can't wipe them.
  const update: Database["public"]["Tables"]["organizers"]["Update"] = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.bio !== undefined) update.bio = input.bio || null;
  if (mergedDescription !== undefined) update.description = mergedDescription || null;
  if (input.upiId !== undefined) update.upi_id = input.upiId || null;
  if (input.avatarUrl !== undefined) update.avatar_url = input.avatarUrl;
  if (input.coverUrl !== undefined) update.cover_url = input.coverUrl;
  if (input.instagramUrl !== undefined) update.instagram_url = input.instagramUrl;
  if (input.youtubeUrl !== undefined) update.youtube_url = input.youtubeUrl;
  if (input.xUrl !== undefined) update.x_url = input.xUrl;
  if (input.facebookUrl !== undefined) update.facebook_url = input.facebookUrl;
  if (input.linkedinUrl !== undefined) update.linkedin_url = input.linkedinUrl;
  if (input.panNumber !== undefined) update.pan_number = input.panNumber;
  if (input.panName !== undefined) update.pan_name = input.panName;
  if (input.panDocumentUrl !== undefined) update.pan_document_url = input.panDocumentUrl;
  if (input.gstNumber !== undefined) update.gst_number = input.gstNumber;
  if (input.gstBusinessName !== undefined) update.gst_business_name = input.gstBusinessName;
  if (input.bankAccountNumber !== undefined) update.bank_account_number = input.bankAccountNumber;
  if (input.bankIfsc !== undefined) update.bank_ifsc = input.bankIfsc;
  if (input.bankAccountName !== undefined) update.bank_account_name = input.bankAccountName;
  if (input.bankAccountType !== undefined) update.bank_account_type = input.bankAccountType;
  if (input.bankDocumentUrl !== undefined) update.bank_document_url = input.bankDocumentUrl;
  if (input.kycResponseNote !== undefined) update.kyc_response_note = input.kycResponseNote;
  if (input.kycResponseDocumentUrl !== undefined) update.kyc_response_document_url = input.kycResponseDocumentUrl;

  const { error } = await supabase
    .from("organizers")
    .update(update)
    .eq("id", organizer.id);

  if (error) throw error;

  // If KYC data was provided, transition status via the RPC — kyc_status is
  // a privileged column that only flips to PENDING through submit_kyc.
  if (input.panNumber && input.bankAccountNumber) {
    const { error: kycError } = await supabase.rpc("submit_kyc", {
      p_organizer_id: organizer.id,
    });
    if (kycError) {
      console.error("submit_kyc RPC failed:", kycError);
    } else {
      // (Re)submission → admins need to review again
      const { notifyAdmins, addKycMessage } = await import("../notifications");
      await notifyAdmins({
        type: "KYC_SUBMITTED",
        message: `Organizer "${organizer.name}" (re)submitted KYC details — pending review.`,
      });
      const note = input.kycResponseNote?.trim();
      await addKycMessage(
        organizer.id,
        "organizer",
        user.email ?? null,
        note ? `Resubmitted with a response: ${note}` : "Updated KYC details and resubmitted.",
      );
    }
  }
}

export interface CreateOrganizerInput {
  name: string;
  bio: string;
  description?: string;
  organizerIntent?: string;
  upiId: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  panNumber: string;
  panName: string;
  panDocumentUrl?: string | null;
  gstNumber: string;
  gstBusinessName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountName: string;
  bankAccountType: string;
  bankDocumentUrl?: string | null;
  agreedToTerms: boolean;
}
