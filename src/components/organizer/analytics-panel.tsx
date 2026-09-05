import { formatPaise } from "@/lib/format";
import type { EventAnalytics } from "@/lib/types";

export function AnalyticsPanel({
  analytics,
  capacity,
  ticketsSold,
}: {
  analytics: EventAnalytics;
  capacity?: number;
  ticketsSold?: number;
}) {
  const sold = ticketsSold ?? analytics.confirmedOrders;
  const cap = capacity ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((sold / cap) * 100)) : 0;

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
    {
      label: "Tickets sold",
      value: String(sold),
      sub: cap > 0 ? `${pct}% of ${cap} capacity` : undefined,
    },
    { label: "Check-ins", value: String(analytics.checkIns) },
    { label: "Waitlist", value: String(analytics.waitlistCount) },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="glass rounded-2xl p-4">
            <p className="mb-1 text-xs text-muted">{stat.label}</p>
            <p className="text-2xl font-black">{stat.value}</p>
            {stat.sub ? <p className="mt-1 text-[11px] text-muted">{stat.sub}</p> : null}
          </div>
        ))}
      </div>
      {/* Capacity progress bar */}
      {cap > 0 ? (
        <div className="glass rounded-2xl p-4">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-muted">Capacity filled</span>
            <span className="font-bold">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-neon-gradient transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
