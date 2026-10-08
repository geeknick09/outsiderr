"use client";

import {
  cacheTickets,
  getCachedTicket,
  getQueuedScans,
  deleteQueuedScan,
  addHistoryScan,
  markCachedTicketUsed,
} from "./scanner-db";
import { decideLocalScan, toCachedRecord } from "./cache-mapper";

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  queuedCount: number;
  lastSyncAt: number | null;
}

export type SyncStatusCallback = (status: SyncStatus) => void;

export class ScannerSyncManager {
  private eventId: string;
  private pin: string;
  private status: SyncStatus;
  private callbacks: Set<SyncStatusCallback> = new Set();
  private syncInProgress = false;

  constructor(eventId: string, pin: string) {
    this.eventId = eventId;
    this.pin = pin;
    this.status = {
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      syncing: false,
      queuedCount: 0,
      lastSyncAt: null,
    };
  }

  subscribe(callback: SyncStatusCallback): () => void {
    this.callbacks.add(callback);
    callback(this.status);
    return () => this.callbacks.delete(callback);
  }

  private updateStatus(partial: Partial<SyncStatus>) {
    this.status = { ...this.status, ...partial };
    this.callbacks.forEach((cb) => cb(this.status));
  }

  start() {
    if (typeof window === "undefined") return;

    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);

    // Initial queue count
    this.refreshQueueCount();

    // If online, try to sync immediately
    if (navigator.onLine) {
      this.syncQueue();
    }
  }

  stop() {
    if (typeof window === "undefined") return;
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
  }

  private handleOnline = () => {
    this.updateStatus({ online: true });
    this.syncQueue();
  };

  private handleOffline = () => {
    this.updateStatus({ online: false });
  };

  private async refreshQueueCount() {
    const queued = await getQueuedScans(this.eventId);
    this.updateStatus({ queuedCount: queued.length });
  }

  /**
   * Download valid tickets from server and cache them for offline use.
   */
  async downloadTickets(): Promise<void> {
    if (!navigator.onLine) return;

    try {
      // PIN-gated server route: door devices have no Supabase session, and the
      // cache carries no buyer phone or email.
      const { downloadScannerCacheAction } = await import("../actions/cache");
      const { error, tickets } = await downloadScannerCacheAction(this.eventId, this.pin);
      if (error || !tickets) {
        console.error("[sync] downloadTickets:", error);
        return;
      }

      const now = Date.now();
      await cacheTickets(tickets.map((t) => toCachedRecord(t, now)));
      console.log(`[sync] Cached ${tickets.length} tickets for offline use`);
    } catch (err) {
      console.error("[sync] downloadTickets error:", err);
    }
  }

  /**
   * Check a ticket locally against the cache (for offline scanning).
   * Returns a preliminary result - the actual check-in happens when syncing.
   */
  async checkLocal(qrHash: string): Promise<{
    outcome: "VALID" | "ALREADY_USED" | "INVALID";
    holderName: string | null;
    tierName: string | null;
  }> {
    const cached = await getCachedTicket(qrHash);
    const outcome = decideLocalScan(cached, this.eventId);
    if (outcome === "INVALID") return { outcome, holderName: null, tierName: null };
    return { outcome, holderName: cached?.holder_name ?? null, tierName: cached?.tier_name ?? null };
  }

  /**
   * Queue a VALID local scan for later syncing (when offline). Marks the cached
   * ticket USED straight away so a second scan on this device is refused.
   */
  async queueScan(qrHash: string): Promise<void> {
    const { queueScan } = await import("./scanner-db");
    await markCachedTicketUsed(qrHash);
    await queueScan({
      qr_hash: qrHash,
      event_id: this.eventId,
      pin: this.pin,
      timestamp: new Date().toISOString(),
    });
    await this.refreshQueueCount();
  }

  /**
   * Sync all queued scans to the server.
   * Called when internet returns.
   */
  async syncQueue(): Promise<void> {
    if (this.syncInProgress || !navigator.onLine) return;
    this.syncInProgress = true;
    this.updateStatus({ syncing: true });

    try {
      const queued = await getQueuedScans(this.eventId);
      if (queued.length === 0) {
        this.updateStatus({ syncing: false });
        return;
      }

      console.log(`[sync] Syncing ${queued.length} queued scans`);

      const { checkInTicketAction } = await import("@/modules/scanner/actions/check-in");

      for (const scan of queued) {
        const scanId = scan.id;
        if (scanId === undefined) continue;
        try {
          const result = await checkInTicketAction(scan.qr_hash, scan.event_id, scan.pin);
          // ALREADY_USED is treated as a successful sync - the ticket was
          // already checked in (e.g. scanned online while offline scan was
          // queued, or a duplicate offline scan). The check-in RPC is
          // idempotent: it returns ALREADY_USED instead of erroring, so we
          // record the outcome and remove the scan from the queue.
          await addHistoryScan({
            qr_hash: scan.qr_hash,
            event_id: scan.event_id,
            outcome: result.outcome,
            holder_name: result.ticket?.holderName ?? null,
            tier_name: result.ticket?.tierName ?? null,
            timestamp: scan.timestamp,
            synced: true,
          });
          await deleteQueuedScan(scanId);
        } catch (err) {
          console.error(`[sync] Error syncing scan ${scan.qr_hash}:`, err);
          // Leave in queue for next sync attempt
        }
      }

      await this.refreshQueueCount();
      this.updateStatus({ syncing: false, lastSyncAt: Date.now() });
      console.log("[sync] Sync complete");
    } catch (err) {
      console.error("[sync] syncQueue error:", err);
      this.updateStatus({ syncing: false });
    } finally {
      this.syncInProgress = false;
    }
  }
}
