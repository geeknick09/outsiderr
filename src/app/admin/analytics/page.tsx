import { getUserAnalytics, getPaymentAnalytics, getOrganizerAnalytics, getPlatformVirality, getGrowthMetrics } from "@/modules/analytics/server";
import { AnalyticsChartsLazy, ViralityPanel, GrowthPanel } from "@/modules/analytics";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Analytics - Outsiderr" };

export default async function AdminAnalyticsPage() {
  const [userAnalytics, paymentAnalytics, organizerAnalytics, virality, growth] = await Promise.all([
    getUserAnalytics(),
    getPaymentAnalytics(),
    getOrganizerAnalytics(),
    getPlatformVirality(),
    getGrowthMetrics(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Analytics</h1>
        <p className="text-sm text-muted">
          User growth, payment trends, and organizer insights. Export reports as PDF.
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-bold">Growth (last 30 days)</h2>
        <GrowthPanel metrics={growth} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-bold">Virality</h2>
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
