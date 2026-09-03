import Link from "next/link";

import { getAdminStats } from "@/lib/data/admin";
import { listPendingHeroBoosts } from "@/lib/data/hero-boosts";
import { formatPaise } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin Overview — Outsiderr" };

export default async function AdminPage() {
  const [stats, pendingHeroBoosts] = await Promise.all([
    getAdminStats(),
    listPendingHeroBoosts(),
  ]);

  const cards = [
    { label: "Total events", value: String(stats.totalEvents), sub: `${stats.activeEvents} live` },
    { label: "Total orders", value: String(stats.totalOrders), sub: `${stats.pendingOrders} pending` },
    { label: "Revenue collected", value: formatPaise(stats.totalRevenuePaise) },
    {
      label: "Active boosts",
      value: String(stats.activeBoosts),
      sub: `${pendingHeroBoosts.length} Hero pending`,
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

      {/* Pending Hero Boosts alert */}
      {pendingHeroBoosts.length > 0 ? (
        <Link
          href="/admin/boosts"
          className="glass flex items-center justify-between rounded-3xl border border-amber-500/30 p-5 transition-colors hover:border-amber-500/60"
        >
          <div>
            <p className="text-sm font-bold text-amber-500">
              {pendingHeroBoosts.length} Hero Boost{pendingHeroBoosts.length === 1 ? "" : "s"} awaiting verification
            </p>
            <p className="text-xs text-muted">Review and activate pending Hero Boost payments →</p>
          </div>
        </Link>
      ) : null}
    </div>
  );
}
