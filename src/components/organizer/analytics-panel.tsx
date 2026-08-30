import { formatPaise } from "@/lib/format";
import type { EventAnalytics } from "@/lib/types";

export function AnalyticsPanel({ analytics }: { analytics: EventAnalytics }) {
  const stats: { label: string; value: string; sub?: string }[] = [
    { label: "Total orders", value: String(analytics.totalOrders) },
    {
      label: "Confirmed",
      value: String(analytics.confirmedOrders),
      sub: `${analytics.pendingOrders} pending · ${analytics.rejectedOrders} rejected`,
    },
    { label: "Gross revenue", value: formatPaise(analytics.grossRevenuePaise) },
    {
      label: "Net payout",
      value: formatPaise(analytics.netPayoutPaise),
      sub: `Platform fee ${formatPaise(analytics.platformFeePaise)}`,
    },
    { label: "Check-ins", value: String(analytics.checkIns) },
    { label: "Waitlist", value: String(analytics.waitlistCount) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="glass rounded-2xl p-4">
          <p className="mb-1 text-xs text-muted">{stat.label}</p>
          <p className="text-2xl font-black">{stat.value}</p>
          {stat.sub ? <p className="mt-1 text-[11px] text-muted">{stat.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}
