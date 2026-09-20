"use client";

import { useEffect, useState } from "react";
import { CloudOff, Cloud, RefreshCw, Check } from "lucide-react";

import { SyncStatus } from "../../offline/sync-manager";

export function OfflineStatus({ status }: { status: SyncStatus }) {
  const [showSynced, setShowSynced] = useState(false);

  useEffect(() => {
    if (status.lastSyncAt && !status.syncing && status.queuedCount === 0) {
      setShowSynced(true);
      const timer = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [status.lastSyncAt, status.syncing, status.queuedCount]);

  if (showSynced) {
    return (
      <div className="glass flex items-center justify-center gap-2 rounded-2xl p-2 text-xs">
        <Check className="h-4 w-4 text-lime-neon" />
        <span className="font-semibold text-lime-neon">Synced</span>
      </div>
    );
  }

  if (status.syncing) {
    return (
      <div className="glass flex items-center justify-center gap-2 rounded-2xl p-2 text-xs">
        <RefreshCw className="h-4 w-4 animate-spin text-violet-neon" />
        <span className="font-semibold text-violet-neon">Syncing…</span>
      </div>
    );
  }

  if (!status.online) {
    return (
      <div className="glass flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 p-2 text-xs">
        <CloudOff className="h-4 w-4 text-amber-500" />
        <span className="font-semibold text-amber-500">
          Offline{status.queuedCount > 0 ? ` · ${status.queuedCount} queued` : ""}
        </span>
      </div>
    );
  }

  if (status.queuedCount > 0) {
    return (
      <div className="glass flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 p-2 text-xs">
        <RefreshCw className="h-4 w-4 text-amber-500" />
        <span className="font-semibold text-amber-500">
          {status.queuedCount} scan{status.queuedCount > 1 ? "s" : ""} queued
        </span>
      </div>
    );
  }

  return (
    <div className="glass flex items-center justify-center gap-2 rounded-2xl p-2 text-xs">
      <Cloud className="h-4 w-4 text-lime-neon" />
      <span className="font-semibold text-lime-neon">Online</span>
    </div>
  );
}
