"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";

import { Button, useRealtime } from "@/modules/shared";

/**
 * Realtime collaboration watcher for the manage page — mounted at page level
 * (not inside a tab) so it stays subscribed no matter which tab is viewed.
 *
 * Two jobs:
 *  1. Sync — any event_collaborators change (invite accepted, permission
 *     changed, someone removed) refreshes the page, so permission-gated UI
 *     like money analytics flips live for BOTH owner and collaborators.
 *  2. Revoke — when the owner's change removes/de-accepts THIS viewer's row,
 *     covers the page with a "removed" overlay and redirects to /organizer.
 */
export function CollaboratorAccessWatcher({
  eventId,
  myOrganizerId,
  myCollaboratorId,
}: {
  eventId: string;
  myOrganizerId: string | null;
  myCollaboratorId: string | null;
}) {
  const router = useRouter();
  const [revoked, setRevoked] = useState(false);

  useRealtime({
    channelName: `collab-access-${eventId}`,
    table: "event_collaborators",
    event: "*",
    filter: `event_id=eq.${eventId}`,
    enabled: !revoked,
    onPayload: (p) => {
      if (p.eventType === "DELETE") {
        // DELETE payloads always carry the PK in `old`; the full row only
        // when REPLICA IDENTITY FULL is set — check both.
        if (p.old?.id === myCollaboratorId || p.old?.organizer_id === myOrganizerId) {
          setRevoked(true);
          return;
        }
      } else if (p.eventType === "UPDATE" && myOrganizerId) {
        // Status moving away from ACCEPTED (e.g. rejected) also revokes.
        if (p.new?.organizer_id === myOrganizerId && p.new?.status !== "ACCEPTED") {
          setRevoked(true);
          return;
        }
      }
      // Permission changes, other rows, accepts/declines — refetch so
      // accessLevel-gated sections (money, orders) re-render.
      router.refresh();
    },
  });

  useEffect(() => {
    if (!revoked) return;
    const t = setTimeout(() => router.replace("/organizer"), 5000);
    return () => clearTimeout(t);
  }, [revoked, router]);

  if (!revoked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-sm space-y-4 rounded-3xl p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
          <UserX className="h-7 w-7 text-red-500" />
        </div>
        <div>
          <p className="text-lg font-black">Removed as collaborator</p>
          <p className="mt-1 text-sm text-muted">
            The event owner removed your access to this event. You can no longer view
            its analytics or manage it.
          </p>
        </div>
        <Button className="w-full" onClick={() => router.replace("/organizer")}>
          Back to my dashboard
        </Button>
        <p className="text-[11px] text-muted">Redirecting automatically in 5 seconds…</p>
      </div>
    </div>
  );
}
