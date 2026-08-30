import { getAdminStats } from "@/lib/data/admin";
import { formatPaise } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin Overview — Outsiderr" };

export default async function AdminPage() {
  const stats = await getAdminStats();

  const cards = [
    { label: "Total events", value: String(stats.totalEvents), sub: `${stats.activeEvents} live` },
    { label: "Total orders", value: String(stats.totalOrders), sub: `${stats.pendingOrders} pending` },
    { label: "Revenue collected", value: formatPaise(stats.totalRevenuePaise) },
    {
      label: "Active boosts",
      value: String(stats.activeBoosts),
      sub: `${stats.pendingBoosts} pending approval`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Overview</h1>
        <p className="text-sm text-muted">Platform health at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="glass rounded-3xl p-5">
            <p className="mb-1 text-xs text-muted">{card.label}</p>
            <p className="text-3xl font-black">{card.value}</p>
            {card.sub ? <p className="mt-1 text-xs text-muted">{card.sub}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
