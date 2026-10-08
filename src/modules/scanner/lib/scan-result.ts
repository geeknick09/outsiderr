import type { ScanOutcome, ScanResult } from "@/modules/shared";

/** Wording shown at the door for each outcome. */
export const SCAN_MESSAGES: Record<ScanOutcome, string> = {
  VALID: "Checked in.",
  ALREADY_USED: "This ticket has already been checked in.",
  INVALID: "Ticket not recognised.",
  CANCELLED: "This ticket was cancelled.",
  WRONG_EVENT: "This ticket is for a different event.",
  DUPLICATE_CONFLICT: "Already checked in on another door while this scan was offline.",
};

export interface ScanTicketRow {
  outcome: string;
  event_title: string | null;
  tier_name: string | null;
  holder_name: string | null;
  checked_in_at: string | null;
}

const KNOWN = new Set<string>(Object.keys(SCAN_MESSAGES));

/**
 * Maps a token check-in row to the door result. The door screen gets the holder
 * name only: phone and email are never sent to a door device.
 */
export function toScanResult(row: ScanTicketRow | undefined): ScanResult {
  if (!row || !KNOWN.has(row.outcome)) return { outcome: "INVALID", message: SCAN_MESSAGES.INVALID };
  const outcome = row.outcome as ScanOutcome;
  return {
    outcome,
    message: SCAN_MESSAGES[outcome],
    ticket: {
      eventTitle: row.event_title ?? "Event",
      tierName: row.tier_name ?? "",
      holderName: row.holder_name,
      holderEmail: null,
      holderPhone: null,
      quantity: 1,
      checkedInAt: row.checked_in_at,
    },
  };
}
