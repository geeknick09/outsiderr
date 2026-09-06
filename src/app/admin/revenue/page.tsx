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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Total Transaction Volume (GMV)</p>
          <p className="text-3xl font-black text-white">{formatPaise(analytics.totalBuyerPaidPaise)}</p>
          <p className="mt-1 text-xs text-muted">Total amount collected from buyers (subtotal + convenience)</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Gross Ticket Sales</p>
          <p className="text-3xl font-black text-lime-neon">{formatPaise(analytics.totalGrossPaise)}</p>
          <p className="mt-1 text-xs text-muted">Face value of all confirmed tickets sold</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Total Net Payouts</p>
          <p className="text-3xl font-black text-pink-neon">{formatPaise(analytics.totalNetPayoutPaise)}</p>
          <p className="mt-1 text-xs text-muted">Payable to organizers (subtotal − commission)</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Platform Commission</p>
          <p className="text-3xl font-black text-violet-neon">{formatPaise(analytics.totalCommissionPaise)}</p>
          <p className="mt-1 text-xs text-muted">Earned from organizer ticket sales (tiered 5% - 10%)</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Buyer Convenience Fees</p>
          <p className="text-3xl font-black text-cyan-400">{formatPaise(analytics.totalConvenienceFeePaise)}</p>
          <p className="mt-1 text-xs text-muted">Earned from buyer checkout fees (~2%)</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="mb-1 text-xs text-muted">Gross Platform Earnings</p>
          <p className="text-3xl font-black text-emerald-400">{formatPaise(analytics.totalPlatformFeePaise)}</p>
          <p className="mt-1 text-xs text-muted">Commission + convenience fee (before taxes & vendor costs)</p>
        </div>
      </div>

      {/* Per-event breakdown */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Per-Event Financial Breakdown</h2>
        {analytics.perEvent.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No confirmed orders yet.</p>
        ) : (
          <div className="space-y-2">
            {analytics.perEvent.map((row) => (
              <div key={row.eventId} className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-4">
                <div className="min-w-0 max-w-sm flex-1">
                  <a
                    href={`/events/${row.eventId}`}
                    target="_blank"
                    className="block truncate font-semibold hover:text-violet-neon"
                  >
                    {row.eventTitle} ↗
                  </a>
                  <p className="text-xs text-muted">
                    {row.organizerName} · {row.confirmedOrders} confirmed order{row.confirmedOrders === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5 sm:text-right">
                  <div>
                    <p className="text-muted">Buyer Paid</p>
                    <p className="font-semibold text-white">{formatPaise(row.buyerPaidPaise)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Ticket Sales</p>
                    <p className="font-semibold text-lime-neon">{formatPaise(row.grossPaise)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Commission</p>
                    <p className="font-semibold text-violet-neon">−{formatPaise(row.commissionPaise)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Platform Gross</p>
                    <p className="font-semibold text-emerald-400">{formatPaise(row.platformFeePaise)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Net Payout</p>
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
