export interface OrganizerAccessState {
  eligible: boolean;
  blocked: boolean;
  canResubmit: boolean;
  rejectionCount: number;
  rejectionLimit: number;
}

// ---------------------------------------------------------------------------
// KYC change staging — APPROVED organizers' sensitive edits are staged into
// organizers.pending_kyc (column name → new value) and only applied to the
// real columns after admin re-verification.
// ---------------------------------------------------------------------------

/** Sensitive (verification-gated) organizer fields: input key → [column, current-value getter]. */
export const SENSITIVE_KYC_FIELDS: readonly {
  field: string;
  column: string;
}[] = [
  { field: "organizerIntent", column: "organizer_intent" },
  { field: "upiId", column: "upi_id" },
  { field: "panNumber", column: "pan_number" },
  { field: "panName", column: "pan_name" },
  { field: "panDocumentUrl", column: "pan_document_url" },
  { field: "gstNumber", column: "gst_number" },
  { field: "gstBusinessName", column: "gst_business_name" },
  { field: "bankAccountNumber", column: "bank_account_number" },
  { field: "bankIfsc", column: "bank_ifsc" },
  { field: "bankAccountName", column: "bank_account_name" },
  { field: "bankAccountType", column: "bank_account_type" },
  { field: "bankDocumentUrl", column: "bank_document_url" },
];

/**
 * Compute the next pending_kyc change-set for an approved organizer.
 * - Fields not present in the input are left untouched (pending or not).
 * - A field differing from the verified value is staged.
 * - A field reverted back to the verified value is removed from pending.
 */
export function computePendingKyc(input: {
  existing: Record<string, string | null> | null | undefined;
  /** column → { proposed value (undefined = not provided), current verified value } */
  values: Record<string, { value: string | null | undefined; current: string | null }>;
}): Record<string, string | null> {
  const next: Record<string, string | null> = { ...(input.existing ?? {}) };
  for (const [column, { value, current }] of Object.entries(input.values)) {
    if (value === undefined) continue;
    const normalized = value || null;
    if (normalized !== current) next[column] = normalized;
    else delete next[column];
  }
  return next;
}

export function getOrganizerAccessState(input: {
  kycStatus?: string | null;
  rejectionCount?: number | null;
  rejectionLimit?: number | null;
}): OrganizerAccessState {
  const validStatus = input.kycStatus ?? "NOT_SUBMITTED";
  const rejectionCount = Math.max(0, Number(input.rejectionCount ?? 0) || 0);
  // Minimum is 1 — a missing/invalid/non-positive stored value falls back to
  // the default 5 so it can't silently disable rejection blocking.
  const rawLimit = Number(input.rejectionLimit ?? 5);
  const rejectionLimit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : 5;

  if (validStatus === "APPROVED") {
    return {
      eligible: true,
      blocked: false,
      canResubmit: false,
      rejectionCount,
      rejectionLimit,
    };
  }

  const isBlockReached = rejectionCount >= rejectionLimit && rejectionLimit > 0;
  const canResubmit = validStatus === "REJECTED" && !isBlockReached;

  return {
    eligible: false,
    blocked: isBlockReached,
    canResubmit,
    rejectionCount,
    rejectionLimit,
  };
}
