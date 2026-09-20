"use client";

import {
  cacheTickets,
  getCachedTicket,
  getQueuedScans,
  deleteQueuedScan,
  addHistoryScan,
  type CachedTicket,
} from "./scanner-db";

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
      // Fetch valid tickets for this event via Supabase client
      const { createClient } = await import("@/modules/shared");
      const supabase = createClient();
      const { data: tickets } = await supabase
        .from("tickets")
        .select(`
          qr_hash,
          event_id,
          status,
          tier_id,
          order_id
        `)
        .eq("event_id", this.eventId)
        .eq("status", "VALID");

      if (!tickets || tickets.length === 0) return;

      // Fetch tier names and order buyer names
      const tierIds = [...new Set(tickets.map((t) => t.tier_id).filter(Boolean))] as string[];
      const orderIds = [...new Set(tickets.map((t) => t.order_id).filter(Boolean))] as string[];

      const [tierRes, orderRes] = await Promise.all([
        tierIds.length > 0
          ? supabase.from("ticket_tiers").select("id, name").in("id", tierIds)
          : { data: null },
        orderIds.length > 0
          ? supabase.from("orders").select("id, buyer_name, buyer_phone, buyer_email").in("id", orderIds)
          : { data: null },
      ]);

      const tierMap = Object.fromEntries((tierRes.data ?? []).map((t) => [t.id, t.name]));
      const orderMap = Object.fromEntries((orderRes.data ?? []).map((o) => [o.id, o]));

      const cachedTickets: CachedTicket[] = tickets.map((t) => ({
        qr_hash: t.qr_hash,
        event_id: t.event_id,
        status: t.status,
        tier_name: t.tier_id ? tierMap[t.tier_id] ?? null : null,
        holder_name: t.order_id ? orderMap[t.order_id]?.buyer_name ?? null : null,
        buyer_phone: t.order_id ? orderMap[t.order_id]?.buyer_phone ?? null : null,
        buyer_email: t.order_id ? orderMap[t.order_id]?.buyer_email ?? null : null,
        cached_at: Date.now(),
      }));

      await cacheTickets(cachedTickets);
      console.log(`[sync] Cached ${cachedTickets.length} valid tickets for offline use`);
    } catch (err) {
      console.error("[sync] downloadTickets error:", err);
    }
  }

  /**
   * Check a ticket locally against the cache (for offline scanning).
   * Returns a preliminary result — the actual check-in happens when syncing.
   */
  async checkLocal(qrHash: string): Promise<{
    outcome: "VALID" | "ALREADY_USED" | "INVALID";
    holderName: string | null;
    tierName: string | null;
  }> {
    const cached = await getCachedTicket(qrHash);
    if (!cached) {
      return { outcome: "INVALID", holderName: null, tierName: null };
    }
    if (cached.event_id !== this.eventId) {
      return { outcome: "INVALID", holderName: null, tierName: null };
    }
    if (cached.status !== "VALID") {
      return { outcome: "ALREADY_USED", holderName: cached.holder_name, tierName: cached.tier_name };
    }
    return { outcome: "VALID", holderName: cached.holder_name, tierName: cached.tier_name };
  }

  /**
   * Queue a scan for later syncing (when offline).
   */
  async queueScan(qrHash: string): Promise<void> {
    const { queueScan } = await import("./scanner-db");
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

      const { checkInTicketAction } = await import("@/actions/orders");

      for (const scan of queued) {
        const scanId = scan.id;
        if (scanId === undefined) continue;
        try {
          const result = await checkInTicketAction(scan.qr_hash, scan.event_id, scan.pin);
          // ALREADY_USED is treated as a successful sync — the ticket was
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
