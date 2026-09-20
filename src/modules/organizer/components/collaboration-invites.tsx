"use client";

import { useTransition } from "react";
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

  if (invites.length === 0) return null;

  function handleAccept(eventId: string, inviteId: string) {
    startTransition(async () => {
      await acceptCollaborationAction(eventId, inviteId);
    });
  }

  function handleReject(eventId: string, inviteId: string) {
    startTransition(async () => {
      await rejectCollaborationAction(eventId, inviteId);
    });
  }

  return (
    <div className="glass space-y-3 rounded-3xl p-5">
      <h3 className="text-sm font-bold">Collaboration Invites</h3>
      {invites.map((invite) => (
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
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Accept
            </button>
            <button
              type="button"
              onClick={() => handleReject(invite.eventId, invite.id)}
              disabled={pending}
              className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
            >
              <X className="h-3 w-3" />
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
