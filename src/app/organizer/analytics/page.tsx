import { AggregatedAnalytics, AudienceAnalytics } from "@/modules/analytics";
import { KycStatusBanner } from "@/modules/organizer";
import { OrganizerKycRealtimeRefresher } from "@/modules/organizer";
import { PremiumGate } from "@/modules/organizer";
import { LatestEventsList } from "@/modules/organizer";
import { getPremiumPlans, isPremiumGateEnabled } from "@/modules/organizer/actions/premium";
import {
  getOrganizerEventAnalytics,
  getOrganizerDailyRevenue,
  getOrganizerAudienceAnalytics,
} from "@/modules/analytics/server";
import { listOrganizerEvents, listCollaboratedEvents } from "@/modules/organizer/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";

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

  const isPremium =
    !!organizerProfile.premiumUntil &&
    new Date(organizerProfile.premiumUntil).getTime() > Date.now();
  const windowDays = isPremium ? 180 : 90;

  const [analyticsData, dailyRevenue, audience, premiumGate, premiumPlans] =
    await Promise.all([
      Promise.all(allEvents.map((event) => getOrganizerEventAnalytics(user, event.id))),
      getOrganizerDailyRevenue(user, 30),
      getOrganizerAudienceAnalytics(user, windowDays),
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
            <h2 className="mb-1 text-lg font-bold">Audience Insights</h2>
            <p className="mb-3 text-xs text-muted">
              {isPremium
                ? "Showing the last 6 months - Premium unlocks extended history."
                : "Showing the last 3 months - Premium unlocks 6 months of history."}
            </p>
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
            <LatestEventsList events={nonDraftEvents} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
