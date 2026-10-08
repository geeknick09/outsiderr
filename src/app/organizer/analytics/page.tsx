import Link from "next/link";

import { AggregatedAnalytics, AudienceAnalytics } from "@/modules/analytics";
import { KycStatusBanner } from "@/modules/organizer";
import { OrganizerHeader } from "@/modules/organizer";
import { OrganizerKycRealtimeRefresher } from "@/modules/organizer";
import { PremiumGate } from "@/modules/organizer";
import { getPremiumPlans, isPremiumGateEnabled } from "@/modules/organizer/actions/premium";
import { formatDateRange } from "@/modules/shared";
import {
  getOrganizerEventAnalytics,
  getOrganizerDailyRevenue,
  getOrganizerAudienceAnalytics,
} from "@/modules/analytics/server";
import { listOrganizerEvents, listCollaboratedEvents } from "@/modules/organizer/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";
import { getOrganizerFollowerCount } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Organizer Analytics - Outsiderr" };

export default async function OrganizerAnalyticsPage() {
  const ctx = await getOrganizerGateContext();
  if ("gate" in ctx) return ctx.gate;
  const { user, organizerProfile } = ctx;

  const [events, collabEvents] = await Promise.all([
    listOrganizerEvents(user),
    listCollaboratedEvents(user),
  ]);
  const ownedIds = new Set(events.map((e) => e.id));
  const allEvents = [...events, ...collabEvents.filter((e) => !ownedIds.has(e.id))];

  const [followerCount, analyticsData, dailyRevenue, audience, premiumGate, premiumPlans] =
    await Promise.all([
      getOrganizerFollowerCount(organizerProfile.id),
      Promise.all(allEvents.map((event) => getOrganizerEventAnalytics(user, event.id))),
      getOrganizerDailyRevenue(user),
      getOrganizerAudienceAnalytics(user),
      isPremiumGateEnabled(),
      getPremiumPlans(),
    ]);

  const analyticsMap: Record<string, NonNullable<(typeof analyticsData)[number]>> = {};
  for (const a of analyticsData) {
    if (a) analyticsMap[a.eventId] = a;
  }

  const nonDraftEvents = allEvents.filter((e) => e.status !== "DRAFT");
  const nonDraftAnalytics = nonDraftEvents
    .map((e) => analyticsMap[e.id])
    .filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <div className="space-y-6 py-6">
      <OrganizerKycRealtimeRefresher userId={user.id} />

      <OrganizerHeader organizer={organizerProfile} followerCount={followerCount} />

      <KycStatusBanner
        kycStatus={organizerProfile.kycStatus ?? "NOT_SUBMITTED"}
        hasPendingChanges={Object.keys(organizerProfile.pendingKyc ?? {}).length > 0}
      />

      <div className="space-y-6">
        <div>
          <h2 className="mb-3 text-lg font-bold">Overview - All Events</h2>
          <AggregatedAnalytics
            events={nonDraftEvents}
            analyticsData={nonDraftAnalytics}
            dailyRevenue={dailyRevenue}
          />
        </div>

        {audience ? (
          <div>
            <h2 className="mb-3 text-lg font-bold">Audience Insights</h2>
            <PremiumGate
              gateEnabled={premiumGate}
              premiumUntil={organizerProfile.premiumUntil ?? null}
              plans={premiumPlans}
            >
              <AudienceAnalytics data={audience} />
            </PremiumGate>
          </div>
        ) : null}

        {nonDraftEvents.length > 0 ? (
          <div>
            <h2 className="mb-3 text-lg font-bold">Latest Events</h2>
            <p className="mb-2 text-xs text-muted">
              Open an event to see its per-event analytics and print the report.
            </p>
            <div className="space-y-1.5">
              {nonDraftEvents.slice(0, 10).map((event) => (
                <Link
                  key={event.id}
                  href={`/organizer/events/${event.id}`}
                  target="_blank"
                  className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
                >
                  <span className="truncate">{event.title}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted">
                    {formatDateRange(event.startsAt, event.endsAt ?? null)} ↗
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
