import Link from "next/link";

import { formatPaise } from "@/lib/format";
import type { EventAnalytics } from "@/lib/types";

export function AnalyticsPanel({
  analytics,
  capacity,
  ticketsSold,
  eventId,
}: {
  analytics: EventAnalytics;
  capacity?: number;
  ticketsSold?: number;
  eventId?: string;
}) {
  const sold = ticketsSold ?? analytics.confirmedOrders;
  const cap = capacity ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((sold / cap) * 100)) : 0;

  const stats: { label: string; value: string; sub?: string; href?: string }[] = [
    { label: "Total orders", value: String(analytics.totalOrders), href: eventId ? `/organizer/events/${eventId}/orders` : undefined },
    {
      label: "Confirmed",
      value: String(analytics.confirmedOrders),
      sub: `${analytics.pendingOrders} pending · ${analytics.rejectedOrders} rejected`,
    },
    { label: "Gross revenue", value: formatPaise(analytics.grossRevenuePaise) },
    {
      label: "Convenience fee",
      value: formatPaise(analytics.convenienceFeePaise),
      sub: "Paid by buyer",
    },
    {
      label: "Net payout",
      value: formatPaise(analytics.netPayoutPaise),
      sub: `Commission −${formatPaise(analytics.commissionPaise)}`,
    },
    {
      label: "Tickets sold",
      value: String(sold),
      sub: cap > 0 ? `${pct}% of ${cap} capacity` : undefined,
    },
    { label: "Check-ins", value: String(analytics.checkIns), href: eventId ? `/organizer/events/${eventId}/checkins` : undefined },
    { label: "Waitlist", value: String(analytics.waitlistCount) },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => {
          const content = (
            <>
              <p className="mb-1 text-xs text-muted">{stat.label}</p>
              <p className="text-2xl font-black">{stat.value}</p>
              {stat.sub ? <p className="mt-1 text-[11px] text-muted">{stat.sub}</p> : null}
            </>
          );

          if (stat.href) {
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className="glass rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-violet-neon/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)] cursor-pointer"
              >
                {content}
                <p className="mt-1 text-[10px] font-semibold text-violet-neon">View details →</p>
              </Link>
            );
          }

          return (
            <div key={stat.label} className="glass rounded-2xl p-4">
              {content}
            </div>
          );
        })}
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

      {/* Per-tier breakdown */}
      {analytics.tierBreakdown.length > 0 ? (
        <div className="glass rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-bold">Tickets by tier</h3>
          <div className="space-y-2">
            {analytics.tierBreakdown.map((tier) => (
              <div key={tier.tierId} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <span className="font-semibold">{tier.tierName}</span>
                  <span className="ml-2 text-xs text-muted">
                    {tier.pricePaise === 0 ? "Free" : formatPaise(tier.pricePaise)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-bold">{tier.quantitySold}</span>
                  <span className="text-muted">sold</span>
                  <span className="text-muted">·</span>
                  <span className="font-bold">{tier.quantityLeft}</span>
                  <span className="text-muted">left</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
