import { AggregatedAnalytics, AudienceAnalytics, OrganizerPaymentsPanel } from "@/modules/analytics";
import { KycStatusBanner } from "@/modules/organizer";
import { OrganizerKycRealtimeRefresher } from "@/modules/organizer";
import { PremiumGate } from "@/modules/organizer";
import { LatestEventsList } from "@/modules/organizer";
import { getPremiumPlans, isPremiumGateEnabled } from "@/modules/organizer/actions/premium";
import {
  getOrganizerEventAnalytics,
  getOrganizerDailyRevenue,
  getOrganizerAudienceAnalytics,
  getOrganizerPaymentSummary,
} from "@/modules/analytics/server";
import { listOrganizerEvents, listCollaboratedEvents } from "@/modules/organizer/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";
import { listMyCommunities, getCommunityAnalytics } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Analytics - Creator Hub | Outsiderr" };

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

  const [analyticsData, dailyRevenue, paymentSummary, audience, premiumGate, premiumPlans, communities] =
    await Promise.all([
      Promise.all(allEvents.map((event) => getOrganizerEventAnalytics(user, event.id))),
      getOrganizerDailyRevenue(user, 30),
      getOrganizerPaymentSummary(user),
      getOrganizerAudienceAnalytics(user, windowDays),
      isPremiumGateEnabled(),
      getPremiumPlans(),
      listMyCommunities(user),
    ]);
  const communityStats = await Promise.all(
    communities.map(async (c) => ({ community: c, stats: await getCommunityAnalytics(c.id) })),
  );
  const communityTotals = communityStats.reduce(
    (acc, { stats }) => ({
      members: acc.members + (stats?.total_members ?? 0),
      pending: acc.pending + (stats?.pending_requests ?? 0),
      followers: acc.followers + (stats?.followers ?? 0),
      views: acc.views + (stats?.views ?? 0),
      newThisWeek: acc.newThisWeek + (stats?.new_members_30d ?? 0),
    }),
    { members: 0, pending: 0, followers: 0, views: 0, newThisWeek: 0 },
  );

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

        {paymentSummary ? (
          <div>
            <h2 className="mb-1 text-lg font-bold">Payments &amp; sales rhythm</h2>
            <p className="mb-3 text-xs text-muted">
              Confirmed-order money totals across all events, plus the hours your tickets actually sell.
            </p>
            <OrganizerPaymentsPanel summary={paymentSummary} />
          </div>
        ) : null}

        {communities.length ? (
          <div>
            <h2 className="mb-1 text-lg font-bold">Communities</h2>
            <p className="mb-3 text-xs text-muted">
              {communityTotals.members} members · {communityTotals.followers} followers ·{" "}
              {communityTotals.newThisWeek} new this week · {communityTotals.pending} pending requests ·{" "}
              {communityTotals.views} viewed-not-joined
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {communityStats.map(({ community: c, stats }) => (
                <a
                  key={c.id}
                  href={`/organizer/communities/${c.id}?tab=analytics`}
                  className="glass rounded-3xl p-4 transition-colors hover:border-violet-neon"
                >
                  <p className="text-sm font-bold">{c.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {stats?.total_members ?? 0} members · {stats?.followers ?? 0} followers ·{" "}
                    {stats?.views ?? 0} views
                    {stats && stats.views > 0 ? ` · ${Math.round((stats.total_members / stats.views) * 100)}% join rate` : ""}
                  </p>
                </a>
              ))}
            </div>
          </div>
        ) : null}

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
