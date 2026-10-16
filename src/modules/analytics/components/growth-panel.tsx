"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Users, Eye, Share2, MousePointerClick, UserPlus, ShoppingCart, Percent } from "lucide-react";

const PIE = ["#8B5CF6", "#EC4899", "#06b6d4"];

function Stat({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
}) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

/** Admin growth funnel - last 30 days. */
export function GrowthPanel({ metrics }: {
  metrics: {
    trackedVisitors30d: number;
    eventViews30d: number;
    communityViews30d: number;
    shares30d: number;
    promoterClicks30d: number;
    signups30d: number;
    orders30d: number;
    conversionPct: number;
    totalUsers: number;
  };
}) {
  const traffic = [
    { name: "Event views", value: metrics.eventViews30d },
    { name: "Community views", value: metrics.communityViews30d },
    { name: "Tracked shares", value: metrics.shares30d + metrics.promoterClicks30d },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat icon={Users} label="Visitors" value={String(metrics.trackedVisitors30d)} sub={`${metrics.totalUsers} registered total`} />
        <Stat icon={Eye} label="Views" value={String(metrics.eventViews30d + metrics.communityViews30d)} sub={`${metrics.eventViews30d} event · ${metrics.communityViews30d} community`} />
        <Stat icon={Share2} label="Shares" value={String(metrics.shares30d)} sub={`${metrics.promoterClicks30d} promoter clicks`} />
        <Stat icon={MousePointerClick} label="Link clicks" value={String(metrics.promoterClicks30d)} sub="Promoter-tracked" />
        <Stat icon={UserPlus} label="Sign-ups" value={String(metrics.signups30d)} />
        <Stat icon={ShoppingCart} label="Orders" value={String(metrics.orders30d)} sub="Confirmed" />
        <Stat icon={Percent} label="Conversion" value={`${metrics.conversionPct}%`} sub="Confirmed orders ÷ event views" />
      </div>

      {traffic.length > 0 ? (
        <div className="glass rounded-3xl p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Traffic breakdown (30d)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={traffic}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {traffic.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <p className="text-[11px] text-muted">
        Visitors/views/shares are tracked events (signed-in page views, share clicks, promoter
        link clicks) - anonymous browsing isn&apos;t counted yet.
      </p>
    </div>
  );
}
