import "server-only";

import { createServiceClient } from "@/modules/shared/server";
import type { ScanResult } from "@/modules/shared";
import { toScanResult } from "../lib/scan-result";

/** Event a door session belongs to, or null when the token is unknown or expired. */
export async function resolveScannerSessionEvent(token: string): Promise<string | null> {
  if (!token || token.length !== 64) return null;
  const { data } = await createServiceClient().rpc("scanner_session_event", { p_token: token });
  return (data as string | null) ?? null;
}

/**
 * Token-scoped check-in. Shares the same rules as the database check (one event per door
 * session, every attempt logged).
 */
export async function checkInWithScannerToken(
  qrHash: string,
  token: string,
  clientScanId: string,
  source: "ONLINE" | "OFFLINE_SYNC" = "ONLINE",
): Promise<ScanResult> {
  const { data, error } = await createServiceClient().rpc("check_in_ticket_by_token", {
    p_qr_hash: qrHash,
    p_token: token,
    p_client_scan_id: clientScanId,
    p_source: source,
  });
  if (error) throw new Error(error.message);
  const rows = data as { outcome: string; event_title: string | null; tier_name: string | null; holder_name: string | null; checked_in_at: string | null }[] | null;
  return toScanResult(rows?.[0]);
}

export interface ScanLogEntry {
  id: string;
  outcome: string;
  source: string;
  actorName: string | null;
  scannedAt: string;
}

/** Recent door scans for one event, newest first. */
export async function listEventScanLog(eventId: string, limit = 300): Promise<ScanLogEntry[]> {
  const { data } = await createServiceClient()
    .from("scan_log")
    .select("id, outcome, source, actor_name, scanned_at")
    .eq("event_id", eventId)
    .order("scanned_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    outcome: r.outcome,
    source: r.source,
    actorName: r.actor_name,
    scannedAt: r.scanned_at,
  }));
}
