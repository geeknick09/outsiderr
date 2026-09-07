import Link from "next/link";

import { getAdminStats, getUserAnalytics } from "@/lib/data/admin";
import { listPendingHeroBoosts } from "@/lib/data/hero-boosts";
import { formatPaise } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin Overview — Outsiderr" };

export default async function AdminPage() {
  const [stats, pendingHeroBoosts, userAnalytics] = await Promise.all([
    getAdminStats(),
    listPendingHeroBoosts(),
    getUserAnalytics(),
  ]);

  const cards = [
    { label: "Total events", value: String(stats.totalEvents), sub: `${stats.activeEvents} live` },
    { label: "Confirmed orders", value: String(stats.confirmedOrders), sub: `${stats.pendingOrders} legacy pending` },
    { label: "Gross revenue", value: formatPaise(stats.grossRevenuePaise), sub: `Commission ${formatPaise(stats.totalCommissionPaise)}` },
    { label: "Buyer paid (GMV)", value: formatPaise(stats.totalRevenuePaise), sub: `Convenience fee ${formatPaise(stats.totalConvenienceFeePaise)}` },
    { label: "Net payouts", value: formatPaise(stats.totalOrganizerPayoutPaise), sub: `Platform earns ${formatPaise(stats.totalPlatformFeePaise)}` },
    {
      label: "Active boosts",
      value: String(stats.activeBoosts),
      sub: `${pendingHeroBoosts.length} Front Row pending`,
    },
    { label: "Total users", value: String(userAnalytics.totalUsers), sub: `${userAnalytics.organizersCount} organizers` },
    { label: "DAU", value: String(userAnalytics.dau), sub: `${userAnalytics.mau} MAU` },
    { label: "Returning users", value: String(userAnalytics.returningUsers), sub: `${userAnalytics.nonReturningUsers} non-returning` },
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
            <p className="text-2xl font-black">{card.value}</p>
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
              {pendingHeroBoosts.length} Front Row{pendingHeroBoosts.length === 1 ? "" : "s"} awaiting verification
            </p>
            <p className="text-xs text-muted">Review and activate pending Front Row payments →</p>
          </div>
        </Link>
      ) : null}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink href="/admin/analytics" label="View Analytics" />
        <QuickLink href="/admin/revenue" label="Revenue Report" />
        <QuickLink href="/admin/payments" label="Payment Reconciliation" />
        <QuickLink href="/admin/payouts" label="Payouts" />
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="glass rounded-2xl p-4 text-center text-sm font-semibold text-muted transition-colors hover:text-violet-neon"
    >
      {label} →
    </Link>
  );
}
