import { getUserAnalytics, getPaymentAnalytics, getOrganizerAnalytics, getPlatformVirality, getGrowthMetrics } from "@/modules/analytics/server";
import { AnalyticsChartsLazy, ViralityPanel, GrowthPanel } from "@/modules/analytics";
import { AnalyticsFilterBar } from "@/modules/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Analytics - Outsiderr" };

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const filter = {
    city: params.city || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  };

  const [userAnalytics, paymentAnalytics, organizerAnalytics, virality, growth] = await Promise.all([
    getUserAnalytics(filter),
    getPaymentAnalytics(filter),
    getOrganizerAnalytics(filter),
    getPlatformVirality(filter),
    getGrowthMetrics(filter),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Analytics</h1>
        <p className="text-sm text-muted">
          User growth, payment trends, and organizer insights. Export reports as PDF.
        </p>
      </div>

      <AnalyticsFilterBar basePath="/admin/analytics" filter={filter} />

      <div>
        <h2 className="mb-2 text-lg font-bold">Growth{filter.from || filter.to ? "" : " (last 30 days)"}</h2>
        <GrowthPanel metrics={growth} />
      </div>

      <ViralityPanel
        coefficient={virality.k}
        pies={[
          {
            title: "Order sources",
            referredLabel: "Via promoters",
            organicLabel: "Organic",
            referred: virality.orders.referred,
            organic: virality.orders.organic,
          },
          {
            title: "Community joins",
            referredLabel: "Referred by members",
            organicLabel: "Direct",
            referred: virality.joins.referred,
            organic: virality.joins.organic,
          },
        ]}
      />

      <AnalyticsChartsLazy
        userAnalytics={userAnalytics}
        paymentAnalytics={paymentAnalytics}
        organizerAnalytics={organizerAnalytics}
      />
    </div>
  );
}
