import { getRevenueAnalytics } from "@/lib/data/admin";
import { formatPaise } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Revenue — Outsiderr" };

export default async function AdminRevenuePage() {
  const analytics = await getRevenueAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Revenue Analytics</h1>
        <p className="text-sm text-muted">Gross revenue, platform fees, and organizer payouts.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Gross Revenue</p>
          <p className="text-3xl font-black text-lime-neon">{formatPaise(analytics.totalGrossPaise)}</p>
          <p className="mt-1 text-xs text-muted">Total ticket sales (before fees)</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Platform Commission</p>
          <p className="text-3xl font-black text-violet-neon">{formatPaise(analytics.totalPlatformFeePaise)}</p>
          <p className="mt-1 text-xs text-muted">Collected from all confirmed orders</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Net Payouts</p>
          <p className="text-3xl font-black text-pink-neon">{formatPaise(analytics.totalNetPayoutPaise)}</p>
          <p className="mt-1 text-xs text-muted">To be paid to organizers</p>
        </div>
      </div>

      {/* Per-event breakdown */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Per-Event Breakdown</h2>
        {analytics.perEvent.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No confirmed orders yet.</p>
        ) : (
          <div className="space-y-2">
            {analytics.perEvent.map((row) => (
              <div key={row.eventId} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
                <div className="min-w-0 flex-1">
                  <a
                    href={`/events/${row.eventId}`}
                    target="_blank"
                    className="block truncate font-semibold hover:text-violet-neon"
                  >
                    {row.eventTitle} ↗
                  </a>
                  <p className="text-xs text-muted">
                    {row.organizerName} · {row.confirmedOrders} order{row.confirmedOrders === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-xs text-muted">Gross</p>
                    <p className="font-bold text-lime-neon">{formatPaise(row.grossPaise)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">Fee</p>
                    <p className="font-bold text-violet-neon">{formatPaise(row.platformFeePaise)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">Net</p>
                    <p className="font-bold text-pink-neon">{formatPaise(row.netPayoutPaise)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
