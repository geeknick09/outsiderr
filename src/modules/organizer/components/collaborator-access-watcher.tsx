"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";

import { Button, useRealtime, createClient } from "@/modules/shared";

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
 *
 * Revocation never trusts payload fields: DELETE `old` only carries the PK
 * unless REPLICA IDENTITY FULL is set, so we re-verify the row with a live
 * query on every change — plus a 15s poll as backstop if realtime delivery
 * silently fails in production.
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

  // Live re-check: does my collaborator row still exist and stay ACCEPTED?
  // Only meaningful for collaborators (owner has myOrganizerId = null).
  const verifyAccess = useCallback(async () => {
    if (!myOrganizerId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("event_collaborators")
      .select("id, status")
      .eq("event_id", eventId)
      .eq("organizer_id", myOrganizerId)
      .maybeSingle();
    // Query errors must NOT count as removal — a transient failure would
    // otherwise flash a false "removed as collaborator" overlay.
    if (!error && (!data || data.status !== "ACCEPTED")) setRevoked(true);
  }, [eventId, myOrganizerId]);

  useRealtime({
    channelName: `collab-access-${eventId}`,
    table: "event_collaborators",
    event: "*",
    filter: `event_id=eq.${eventId}`,
    enabled: !revoked,
    onPayload: (p) => {
      // Fast path — works when the payload carries enough fields.
      if (p.eventType === "DELETE") {
        if (p.old?.id === myCollaboratorId || p.old?.organizer_id === myOrganizerId) {
          setRevoked(true);
          return;
        }
      } else if (p.eventType === "UPDATE" && myOrganizerId) {
        if (p.new?.organizer_id === myOrganizerId && p.new?.status !== "ACCEPTED") {
          setRevoked(true);
          return;
        }
      }
      // Slow path — re-verify my own row (payload fields can't be trusted)
      // AND refresh so roster/permission changes land for every viewer.
      void verifyAccess();
      router.refresh();
    },
  });

  // Backstop — if realtime delivery fails silently, a removed collaborator
  // still gets bounced within ~15s instead of browsing stale data forever.
  useEffect(() => {
    if (!myOrganizerId || revoked) return;
    const t = setInterval(() => void verifyAccess(), 15000);
    return () => clearInterval(t);
  }, [myOrganizerId, revoked, verifyAccess]);

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
