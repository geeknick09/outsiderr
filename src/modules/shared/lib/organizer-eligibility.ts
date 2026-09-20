export interface OrganizerAccessState {
  eligible: boolean;
  blocked: boolean;
  canResubmit: boolean;
  rejectionCount: number;
  rejectionLimit: number;
}

export function getOrganizerAccessState(input: {
  kycStatus?: string | null;
  rejectionCount?: number | null;
  rejectionLimit?: number | null;
}): OrganizerAccessState {
  const validStatus = input.kycStatus ?? "NOT_SUBMITTED";
  const rejectionCount = Math.max(0, Number(input.rejectionCount ?? 0) || 0);
  const rejectionLimit = Math.max(0, Number(input.rejectionLimit ?? 5) || 5);

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
