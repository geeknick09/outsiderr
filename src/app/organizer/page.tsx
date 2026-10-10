import { redirect } from "next/navigation";

import { CollaborationInvites } from "@/modules/organizer";
import { KycStatusBanner } from "@/modules/organizer";
import { OrganizerEventsList } from "@/modules/organizer";
import { OrganizerHeader } from "@/modules/organizer";
import { OrganizerKycRealtimeRefresher } from "@/modules/organizer";
import { getPendingCollaborationInvites } from "@/modules/shared/server";
import { getOrganizerEventAnalytics } from "@/modules/analytics/server";
import { listOrganizerEvents, listCollaboratedEvents } from "@/modules/organizer/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";
import { getOrganizerFollowerCount } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Creator Hub - Outsiderr" };

export default async function OrganizerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Legacy deep-links - tabs are real routes now.
  const { tab } = await searchParams;
  if (tab === "analytics") redirect("/organizer/analytics");
  if (tab === "communities") redirect("/organizer/communities");

  const ctx = await getOrganizerGateContext();
  if ("gate" in ctx) return ctx.gate;
  const { user, organizerProfile } = ctx;

  const [events, collabInvites, collabEvents] = await Promise.all([
    listOrganizerEvents(user),
    getPendingCollaborationInvites(user),
    listCollaboratedEvents(user),
  ]);

  // Merge owned events + collaborated events (dedup by id, owned takes precedence)
  const ownedIds = new Set(events.map((e) => e.id));
  const collaboratedEvents = collabEvents.filter((e) => !ownedIds.has(e.id));
  const allEvents = [...events, ...collaboratedEvents];

  // Per-event analytics power the events-list sorting (waitlist/revenue chips).
  const analyticsData = await Promise.all(
    allEvents.map((event) => getOrganizerEventAnalytics(user, event.id)),
  );
  const analyticsMap: Record<string, NonNullable<(typeof analyticsData)[number]>> = {};
  for (const a of analyticsData) {
    if (a) analyticsMap[a.eventId] = a;
  }

  return (
    <div className="space-y-6 py-6">
      <OrganizerKycRealtimeRefresher userId={user.id} />

      <KycStatusBanner
        kycStatus={organizerProfile.kycStatus ?? "NOT_SUBMITTED"}
        hasPendingChanges={Object.keys(organizerProfile.pendingKyc ?? {}).length > 0}
      />

      {collabInvites.length > 0 ? <CollaborationInvites invites={collabInvites} /> : null}

      <OrganizerEventsList events={allEvents} analyticsMap={analyticsMap} />
    </div>
  );
}
