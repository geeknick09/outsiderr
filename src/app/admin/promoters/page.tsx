import { formatDateTime, formatPaise, Badge } from "@/modules/shared";
import { getAdminPromoters } from "@/modules/shared/server";
import { PromoterAdminActions, PromoterPayoutActions } from "./promoter-admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Promoters - Outsiderr" };

export default async function AdminPromotersPage() {
  const { promoters, payouts } = await getAdminPromoters();

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Promoters</h1>
        <p className="text-sm text-muted">
          Settled 7 days after each event - create a payout once bank details are in, then mark it complete with the UTR.
        </p>
      </div>

      <section className="glass overflow-hidden rounded-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-muted dark:border-white/10">
              <th className="px-4 py-3">Promoter</th>
              <th className="px-4 py-3">Earned (net)</th>
              <th className="px-4 py-3">Payable</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Creators onboarded</th>
              <th className="px-4 py-3">Bank</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {promoters.map((p) => (
              <tr key={p.id} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                <td className="px-4 py-3">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted">{p.email}</p>
                  {p.isBlocked ? <Badge tone="danger">Blocked</Badge> : null}
                </td>
                <td className="px-4 py-3 font-semibold">{formatPaise(p.earnedPaise)}</td>
                <td className="px-4 py-3 font-semibold text-lime-500">{formatPaise(p.payablePaise)}</td>
                <td className="px-4 py-3">{formatPaise(p.paidPaise)}</td>
                <td className="px-4 py-3 text-xs">
                  {p.orgReferrals.length > 0 ? (
                    <span>
                      {p.orgReferrals.length} · {formatPaise(p.orgReferralEarnedPaise)} earned
                    </span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.hasBank ? (
                    <span className="text-muted">
                      {p.snapshot.account?.slice(-4) ? `••••${p.snapshot.account.slice(-4)}` : ""} · {p.snapshot.ifsc}
                    </span>
                  ) : (
                    <Badge tone="warning">No bank</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <PromoterAdminActions
                    promoterId={p.id}
                    isBlocked={p.isBlocked}
                    canPayout={p.hasBank && p.payablePaise > 0}
                  />
                </td>
              </tr>
            ))}
            {promoters.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">No promoters yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {promoters.some((p) => p.orgReferrals.length > 0) ? (
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 text-sm font-bold">Creator referrals</h2>
          <div className="space-y-3">
            {promoters.filter((p) => p.orgReferrals.length > 0).map((p) => (
              <div key={p.id}>
                <p className="text-sm font-semibold">{p.name}</p>
                <div className="mt-1 space-y-1">
                  {p.orgReferrals.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-white/10">
                      <span className="font-semibold">{o.name}</span>
                      <span className="text-muted">
                        joined {o.joinedAt ? formatDateTime(o.joinedAt) : "-"} · {o.eventsUsed} events counted
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {payouts.length > 0 ? (
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 text-sm font-bold">Payout history</h2>
          <div className="space-y-1.5">
            {payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted">{formatDateTime(p.initiatedAt)}</span>
                <span className="font-bold">{formatPaise(p.amountPaise)}</span>
                <span className="text-xs text-muted">{p.bankReference ?? "-"}</span>
                <PromoterPayoutActions payoutId={p.id} status={p.status} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

