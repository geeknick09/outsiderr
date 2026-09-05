"use client";

import { useTransition } from "react";
import { BellRing, Loader2, X } from "lucide-react";

import { joinWaitlistAction, leaveWaitlistAction } from "@/actions/waitlist";
import { Button } from "@/components/ui/button";
import type { WaitlistEntry } from "@/lib/types";

export function WaitlistButton({
  tierId,
  eventId,
  tierName,
  waitlistEntry,
  waitlistCount,
}: {
  tierId: string;
  eventId: string;
  tierName: string;
  waitlistEntry: WaitlistEntry | null;
  waitlistCount: number;
}) {
  const [pending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      await joinWaitlistAction(eventId, tierId);
    });
  }

  function handleLeave() {
    if (!waitlistEntry) return;
    startTransition(async () => {
      await leaveWaitlistAction(waitlistEntry.id, eventId);
    });
  }

  if (waitlistEntry) {
    return (
      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
        <p className="mb-1 text-sm font-bold">{tierName}</p>
        <p className="mb-3 text-xs text-muted">
          You are #{waitlistEntry.position} on the waitlist.
          {waitlistEntry.status === "OFFERED"
            ? " A spot has been offered to you — check your tickets!"
            : ""}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={handleLeave}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-red-500 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          {pending ? "Leaving…" : "Leave waitlist"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold">{tierName}</p>
        <span className="text-xs text-muted opacity-60">Sold out</span>
      </div>
      {waitlistCount > 0 ? (
        <p className="mb-3 text-xs text-muted">{waitlistCount} people waiting</p>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        loading={pending}
        loadingText="Joining…"
        onClick={handleJoin}
        className="w-full"
      >
        <BellRing className="h-3.5 w-3.5" />
        Join Waitlist
      </Button>
    </div>
  );
}
