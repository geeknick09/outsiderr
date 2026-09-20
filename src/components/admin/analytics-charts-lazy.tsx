"use client";

import dynamicImport from "next/dynamic";

// Lazy-load AnalyticsCharts — it pulls in recharts + jspdf (heavy libs ~250kB)
// ssr: false is allowed here because this is a Client Component
const AnalyticsCharts = dynamicImport(
  () => import("@/components/admin/analytics-charts").then((m) => m.AnalyticsCharts),
  {
    loading: () => (
      <div className="glass h-96 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
    ),
    ssr: false,
  },
);

export function AnalyticsChartsLazy(props: {
  userAnalytics: import("@/modules/analytics/server").UserAnalytics;
  paymentAnalytics: import("@/modules/analytics/server").PaymentAnalytics;
  organizerAnalytics: import("@/modules/analytics/server").OrganizerAnalytics;
}) {
  return <AnalyticsCharts {...props} />;
}
