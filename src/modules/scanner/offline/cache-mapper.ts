// Pure helpers for the offline door cache. No IndexedDB or network here, so
// they can be unit-tested. Buyer phone and email are deliberately not part of
// the cached shape: the device only needs the name shown at the gate.

export interface CacheTicketRow {
  qr_hash: string;
  event_id: string;
  status: string;
  tier_name: string | null;
  holder_name: string | null;
  checked_in_at: string | null;
}

export interface CachedTicketRecord extends CacheTicketRow {
  cached_at: number;
}

export type LocalOutcome = "VALID" | "ALREADY_USED" | "INVALID";

export function toCachedRecord(row: CacheTicketRow, cachedAt: number): CachedTicketRecord {
  return {
    qr_hash: row.qr_hash,
    event_id: row.event_id,
    status: row.status,
    tier_name: row.tier_name,
    holder_name: row.holder_name,
    checked_in_at: row.checked_in_at,
    cached_at: cachedAt,
  };
}

/** Decide a scan from the cache alone. Unknown tickets, or tickets from another event, are INVALID. */
export function decideLocalScan(
  cached: Pick<CachedTicketRecord, "event_id" | "status"> | null,
  eventId: string,
): LocalOutcome {
  if (!cached || cached.event_id !== eventId) return "INVALID";
  return cached.status === "VALID" ? "VALID" : "ALREADY_USED";
}
