"use client";

import { useState, useTransition } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { acceptCollaborationAction, rejectCollaborationAction } from "@/modules/shared/actions/engagement";

interface Invite {
  id: string;
  eventId: string;
  eventTitle: string;
  invitedByName: string;
  status: string;
  createdAt: string;
}

export function CollaborationInvites({ invites }: { invites: Invite[] }) {
  const [pending, startTransition] = useTransition();
  // Which invite + which action is in flight — the spinner must land on the
  // button the user actually pressed, not always on Accept.
  const [acting, setActing] = useState<{ id: string; action: "accept" | "reject" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (invites.length === 0) return null;

  function handleAccept(eventId: string, inviteId: string) {
    setActing({ id: inviteId, action: "accept" });
    startTransition(async () => {
      try {
        const result = await acceptCollaborationAction(eventId, inviteId);
        if (result.error) setError(result.error);
      } catch {
        setError("Couldn't accept the invite. Try again.");
      }
      setActing(null);
    });
  }

  function handleReject(eventId: string, inviteId: string) {
    setActing({ id: inviteId, action: "reject" });
    startTransition(async () => {
      try {
        const result = await rejectCollaborationAction(eventId, inviteId);
        if (result.error) setError(result.error);
      } catch {
        setError("Couldn't decline the invite. Try again.");
      }
      setActing(null);
    });
  }

  return (
    <div className="glass space-y-3 rounded-3xl p-5">
      <h3 className="text-sm font-bold">Collaboration Invites</h3>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {invites.map((invite) => {
        const accepting = acting?.id === invite.id && acting.action === "accept";
        const rejecting = acting?.id === invite.id && acting.action === "reject";
        return (
        <div
          key={invite.id}
          className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3 dark:border-white/10"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{invite.eventTitle}</p>
            <p className="text-xs text-muted">Invited by {invite.invitedByName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAccept(invite.eventId, invite.id)}
              disabled={pending}
              className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
            >
              {accepting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {accepting ? "Accepting…" : "Accept"}
            </button>
            <button
              type="button"
              onClick={() => handleReject(invite.eventId, invite.id)}
              disabled={pending}
              className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
            >
              {rejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              {rejecting ? "Declining…" : "Reject"}
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}
