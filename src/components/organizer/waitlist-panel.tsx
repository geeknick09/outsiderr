"use client";

import { useState } from "react";
import { Users, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

interface WaitlistEntry {
  id: string;
  tierId: string;
  tierName: string;
  userId: string;
  userName: string;
  position: number;
  status: "WAITING" | "OFFERED" | "EXPIRED";
  createdAt: string;
  offeredAt: string | null;
  expiresAt: string | null;
}

export function WaitlistPanel({
  waitlistCount,
  entries,
}: {
  waitlistCount: number;
  entries: WaitlistEntry[];
}) {
  const [open, setOpen] = useState(false);

  if (waitlistCount === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex w-full items-center justify-between rounded-3xl p-5 text-left transition-colors hover:border-violet-neon/50"
      >
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-violet-neon" />
          <div>
            <p className="text-sm font-bold">Waitlist</p>
            <p className="text-xs text-muted">
              <span className="font-bold text-zinc-900 dark:text-white">{waitlistCount}</span>{" "}
              {waitlistCount === 1 ? "person" : "people"} waiting
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-violet-neon">View details →</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="glass relative z-10 max-h-[80vh] w-full max-w-lg overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-white/10">
              <div>
                <h3 className="text-lg font-bold">Waitlist</h3>
                <p className="text-xs text-muted">{entries.length} entries — first come, first serve</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-muted hover:text-violet-neon"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No waitlist entries.</p>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry, i) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3 dark:border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-neon/10 text-xs font-black text-violet-neon">
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{entry.userName}</p>
                          <p className="text-xs text-muted">{entry.tierName}</p>
                          <p className="text-[10px] text-muted">Joined {formatDateTime(entry.createdAt)}</p>
                        </div>
                      </div>
                      <Badge
                        tone={
                          entry.status === "OFFERED"
                            ? "success"
                            : entry.status === "EXPIRED"
                            ? "danger"
                            : "violet"
                        }
                      >
                        {entry.status === "OFFERED"
                          ? "Offered"
                          : entry.status === "EXPIRED"
                          ? "Expired"
                          : "Waiting"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
