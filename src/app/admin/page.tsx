import Link from "next/link";

import { getAdminStats } from "@/modules/admin/server";
import { getOverviewStats } from "@/modules/admin/server";
import { listPendingHeroBoosts } from "@/modules/shared/server";
import { formatPaise } from "@/modules/shared";
import { OverviewStats, AnalyticsFilterBar, type OverviewCard } from "@/modules/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin Overview - Outsiderr" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const filter = {
    city: params.city || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  };

  const [stats, pendingHeroBoosts, ov] = await Promise.all([
    getAdminStats(),
    listPendingHeroBoosts(),
    getOverviewStats(filter),
  ]);

  const cards: OverviewCard[] = [
    { label: "Events", value: String(ov.totalEvents), sub: `${ov.activeEvents} live`, kind: "events" },
    { label: "Confirmed orders", value: String(ov.confirmedOrders), sub: `${stats.pendingOrders} legacy pending`, kind: "orders" },
    { label: "Gross revenue", value: formatPaise(ov.grossRevenuePaise), sub: `Commission ${formatPaise(ov.totalCommissionPaise)}`, kind: "" },
    { label: "Buyer paid (GMV)", value: formatPaise(ov.totalRevenuePaise), sub: `Convenience fee ${formatPaise(ov.totalConvenienceFeePaise)}`, kind: "" },
    { label: "Net payouts", value: formatPaise(ov.totalOrganizerPayoutPaise), sub: `Platform earns ${formatPaise(ov.totalPlatformFeePaise)}`, kind: "" },
    { label: "Active boosts", value: String(ov.activeBoosts), sub: `${pendingHeroBoosts.length} Front Row pending`, kind: "boosts" },
    { label: "Users", value: String(ov.totalUsers), sub: `${ov.newUsers} new (30d or range)`, kind: "users" },
    { label: "New users", value: String(ov.newUsers), sub: "In selected range / last 30d", kind: "new_users" },
    { label: "Viewed, never booked", value: String(ov.visitorsNoBooking), sub: "Signed-in viewers with no order", kind: "visitors_no_book" },
    { label: "Creators", value: String(ov.totalCreators), sub: "Organizer profiles", kind: "creators" },
    { label: "Communities", value: String(ov.totalCommunities), sub: "All types", kind: "communities" },
    { label: "Admins", value: String(ov.totalAdmins), sub: "Accounts with admin flag", kind: "admins" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Overview</h1>
        <p className="text-sm text-muted">Platform health at a glance. Click a card for details + export.</p>
      </div>

      <AnalyticsFilterBar basePath="/admin" filter={filter} />

      <OverviewStats cards={cards} filter={filter} />

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
      className="glass rounded-2xl p-4 text-center text-sm font-semibold transition-colors hover:border-violet-neon"
    >
      {label}
    </Link>
  );
}
