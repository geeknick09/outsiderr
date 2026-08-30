import { adminApproveBoostAction, adminRejectBoostAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { listBoostSlotPrices, listOccupiedSlots, listPendingBoosts } from "@/lib/data/boosts";
import { formatDateTime, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Boosts — Outsiderr" };

export default async function AdminBoostsPage() {
  const [pending, slotPrices, occupied] = await Promise.all([
    listPendingBoosts(),
    listBoostSlotPrices(),
    listOccupiedSlots(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Boosts</h1>
        <p className="text-sm text-muted">{pending.length} pending approval</p>
      </div>

      {/* Slot grid */}
      <section className="glass rounded-3xl p-5">
        <h2 className="mb-4 text-sm font-bold">Slot availability</h2>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {slotPrices.map((sp) => {
            const taken = occupied.includes(sp.slot);
            return (
              <div
                key={sp.slot}
                className={cn(
                  "flex flex-col items-center rounded-2xl border p-2 text-xs",
                  taken
                    ? "border-red-400/50 bg-red-500/10 text-red-500"
                    : "border-emerald-400/50 bg-emerald-500/10 text-emerald-600",
                )}
              >
                <span className="text-base font-black">{sp.slot}</span>
                <span className="text-[10px]">{taken ? "Taken" : "Free"}</span>
                <span className="text-[10px] text-muted">{formatPaise(sp.pricePaise)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pending requests */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">Pending requests</h2>
        {pending.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No pending boost requests.</p>
        ) : (
          pending.map((boost) => (
            <div key={boost.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{boost.eventTitle}</p>
                <p className="text-xs text-muted">
                  Slot {boost.slot} · {formatPaise(boost.amountPaidPaise)} paid · UTR: {boost.utrReference ?? "—"}
                </p>
                <p className="text-xs text-muted">
                  {formatDateTime(boost.startsAt)} → {formatDateTime(boost.endsAt)}
                </p>
                <p className="text-xs text-zinc-400">{formatDateTime(boost.createdAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="warning">Pending</Badge>
                <form>
                  <button
                    formAction={async () => {
                      "use server";
                      await adminApproveBoostAction(boost.id);
                    }}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-muted hover:border-lime-400 hover:text-lime-600 dark:border-white/10"
                  >
                    Approve
                  </button>
                </form>
                <form>
                  <button
                    formAction={async () => {
                      "use server";
                      await adminRejectBoostAction(boost.id);
                    }}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-muted hover:border-red-400 hover:text-red-500 dark:border-white/10"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
