import { formatPaise } from "@/lib/format";
import type { EventAnalytics, EventSummary } from "@/lib/types";

interface AggregatedData {
  totalOrders: number;
  confirmedOrders: number;
  pendingOrders: number;
  rejectedOrders: number;
  grossRevenuePaise: number;
  platformFeePaise: number;
  netPayoutPaise: number;
  checkIns: number;
  waitlistCount: number;
  totalCapacity: number;
  ticketsSold: number;
  noShows: number;
}

function aggregate(events: EventSummary[], analytics: EventAnalytics[]): AggregatedData {
  return {
    totalOrders: analytics.reduce((s, a) => s + a.totalOrders, 0),
    confirmedOrders: analytics.reduce((s, a) => s + a.confirmedOrders, 0),
    pendingOrders: analytics.reduce((s, a) => s + a.pendingOrders, 0),
    rejectedOrders: analytics.reduce((s, a) => s + a.rejectedOrders, 0),
    grossRevenuePaise: analytics.reduce((s, a) => s + a.grossRevenuePaise, 0),
    platformFeePaise: analytics.reduce((s, a) => s + a.platformFeePaise, 0),
    netPayoutPaise: analytics.reduce((s, a) => s + a.netPayoutPaise, 0),
    checkIns: analytics.reduce((s, a) => s + a.checkIns, 0),
    waitlistCount: analytics.reduce((s, a) => s + a.waitlistCount, 0),
    totalCapacity: events.reduce((s, e) => s + (e.totalCapacity ?? 0), 0),
    ticketsSold: events.reduce((s, e) => s + (e.ticketsSold ?? 0), 0),
    noShows: analytics.reduce((s, a) => s + Math.max(0, a.confirmedOrders - a.checkIns), 0),
  };
}

function MiniBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-bold">{d.value}</span>
            <div
              className={`w-full rounded-t-lg ${d.color}`}
              style={{ height: `${Math.max(2, (d.value / max) * 80)}px` }}
            />
            <span className="text-[9px] text-muted">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueByEventChart({ events }: { events: { title: string; revenue: number }[] }) {
  if (events.length === 0) return null;
  const max = Math.max(...events.map((e) => e.revenue), 1);
  return (
    <div className="glass rounded-2xl p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Revenue by event</p>
      <div className="space-y-2">
        {events.map((e) => (
          <div key={e.title} className="flex items-center gap-2">
            <span className="w-24 truncate text-xs font-semibold">{e.title}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-neon-gradient"
                style={{ width: `${Math.max(2, (e.revenue / max) * 100)}%` }}
              />
            </div>
            <span className="w-16 text-right text-[10px] font-bold">{formatPaise(e.revenue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AggregatedAnalytics({
  events,
  analyticsData,
}: {
  events: EventSummary[];
  analyticsData: EventAnalytics[];
}) {
  if (events.length === 0) {
    return (
      <div className="glass rounded-3xl p-5 text-sm text-muted">
        No events yet. Create an event to see analytics.
      </div>
    );
  }

  const agg = aggregate(events, analyticsData);
  const fillPct = agg.totalCapacity > 0 ? Math.min(100, Math.round((agg.ticketsSold / agg.totalCapacity) * 100)) : 0;

  const overviewStats: { label: string; value: string; sub?: string }[] = [
    { label: "Total events", value: String(events.length) },
    { label: "Total orders", value: String(agg.totalOrders) },
    {
      label: "Confirmed",
      value: String(agg.confirmedOrders),
      sub: `${agg.pendingOrders} pending · ${agg.rejectedOrders} rejected`,
    },
    { label: "Tickets sold", value: String(agg.ticketsSold), sub: `${fillPct}% of ${agg.totalCapacity} capacity` },
    { label: "Gross revenue", value: formatPaise(agg.grossRevenuePaise) },
    {
      label: "Net payout",
      value: formatPaise(agg.netPayoutPaise),
      sub: `Fee ${formatPaise(agg.platformFeePaise)}`,
    },
    { label: "Check-ins", value: String(agg.checkIns) },
    { label: "No-shows", value: String(agg.noShows), sub: agg.confirmedOrders > 0 ? `${Math.round((agg.noShows / agg.confirmedOrders) * 100)}% of confirmed` : undefined },
    { label: "Waitlist", value: String(agg.waitlistCount) },
  ];

  const attendanceData = [
    { label: "Sold", value: agg.ticketsSold, color: "bg-violet-500" },
    { label: "Checked", value: agg.checkIns, color: "bg-emerald-500" },
    { label: "No-show", value: agg.noShows, color: "bg-amber-500" },
    { label: "Waitlist", value: agg.waitlistCount, color: "bg-pink-500" },
  ];

  const orderData = [
    { label: "Confirmed", value: agg.confirmedOrders, color: "bg-emerald-500" },
    { label: "Pending", value: agg.pendingOrders, color: "bg-violet-500" },
    { label: "Rejected", value: agg.rejectedOrders, color: "bg-red-500" },
  ];

  const revenueByEvent = events
    .map((e, i) => ({
      title: e.title,
      revenue: analyticsData[i]?.grossRevenuePaise ?? 0,
    }))
    .filter((e) => e.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {overviewStats.map((stat) => (
          <div key={stat.label} className="glass rounded-2xl p-4">
            <p className="mb-1 text-xs text-muted">{stat.label}</p>
            <p className="text-xl font-black sm:text-2xl">{stat.value}</p>
            {stat.sub ? <p className="mt-1 text-[11px] text-muted">{stat.sub}</p> : null}
          </div>
        ))}
      </div>

      {/* Capacity filled bar */}
      {agg.totalCapacity > 0 ? (
        <div className="glass rounded-2xl p-4">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-muted">Total capacity filled</span>
            <span className="font-bold">{fillPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-neon-gradient transition-all" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      ) : null}

      {/* Charts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Attendance breakdown</p>
          <MiniBarChart data={attendanceData} />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Order status</p>
          <MiniBarChart data={orderData} />
        </div>
      </div>

      {/* Revenue by event */}
      {revenueByEvent.length > 0 ? <RevenueByEventChart events={revenueByEvent} /> : null}
    </div>
  );
}
