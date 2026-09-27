import Link from "next/link";
import { Download } from "lucide-react";

import { Badge } from "@/modules/shared";
import { formatDateTime, formatPaise } from "@/modules/shared";
import { createServiceClient } from "@/modules/shared/server";
import { CreatePayoutForm, PayoutRowActions } from "@/modules/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin: Payouts — Outsiderr" };

const PAYOUT_TONE: Record<string, "warning" | "success" | "danger" | "neutral" | "violet"> = {
  PENDING: "warning",
  PROCESSING: "violet",
  COMPLETED: "success",
  FAILED: "danger",
};

type LedgerRow = { organizer_id: string | null; net_organizer_paise: number };
type PayoutRow = {
  id: string; organizer_id: string; event_id: string | null;
  amount_paise: number; status: string; method: string | null;
  bank_reference: string | null; failure_reason: string | null; notes: string | null;
  initiated_at: string; completed_at: string | null;
  organizers: { name: string } | null;
  events: { title: string } | null;
};

export default async function AdminPayoutsPage() {
  const supabase = createServiceClient();

  const [{ data: ledger }, { data: payouts }] = await Promise.all([
    supabase.from("payment_ledger").select("organizer_id, net_organizer_paise").not("organizer_id", "is", null),
    supabase
      .from("payout_records")
      .select("id, organizer_id, event_id, amount_paise, status, method, bank_reference, failure_reason, notes, initiated_at, completed_at, organizers(name), events(title)")
      .order("initiated_at", { ascending: false })
      .limit(200),
  ]);

  const ledgerRows = (ledger ?? []) as LedgerRow[];
  const payoutRows = (payouts ?? []) as unknown as PayoutRow[];

  // Owed per organizer = Σ net_organizer on the ledger − open payouts.
  const owed = new Map<string, number>();
  for (const r of ledgerRows) {
    owed.set(r.organizer_id!, (owed.get(r.organizer_id!) ?? 0) + r.net_organizer_paise);
  }
  for (const p of payoutRows.filter((x) => x.status === "PENDING" || x.status === "PROCESSING")) {
    owed.set(p.organizer_id, (owed.get(p.organizer_id) ?? 0) - p.amount_paise);
  }

  const { data: orgNames } = await supabase
    .from("organizers")
    .select("id, name")
    .in("id", [...owed.keys()]);
  const nameMap = new Map((orgNames ?? []).map((o) => [o.id, o.name as string]));

  const dueNow = [...owed.entries()].filter(([, v]) => v > 0);
  const totalPending = payoutRows.filter((p) => p.status === "PENDING" || p.status === "PROCESSING")
    .reduce((s, p) => s + p.amount_paise, 0);
  const totalCompleted = payoutRows.filter((p) => p.status === "COMPLETED")
    .reduce((s, p) => s + p.amount_paise, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Organizer payouts</h1>
          <p className="text-sm text-muted">
            Manual settlements — create a payout, send the money, mark it completed. Every completed
            payout writes a negative ledger row so balances stay exact.
          </p>
        </div>
        <Link
          href="/api/admin/export/payouts"
          className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-muted hover:border-violet-neon dark:border-white/10"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Link>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Due to organizers</p>
          <p className="mt-1 text-xl font-black text-amber-600">
            {formatPaise(dueNow.reduce((s, [, v]) => s + v, 0))}
          </p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">In flight</p>
          <p className="mt-1 text-xl font-black">{formatPaise(totalPending)}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Paid out</p>
          <p className="mt-1 text-xl font-black text-emerald-600">{formatPaise(totalCompleted)}</p>
        </div>
      </div>

      {/* Owed per organizer + create payout */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Owed to organizers</h2>
        {dueNow.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-muted">
            Nobody is owed money right now — all settled.
          </div>
        ) : (
          <div className="space-y-2">
            {dueNow.map(([orgId, amount]) => (
              <div key={orgId} className="glass rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{nameMap.get(orgId) ?? orgId.slice(0, 8)}</p>
                    <p className="text-xs text-muted">Due: {formatPaise(amount)}</p>
                  </div>
                  <CreatePayoutForm
                    organizerId={orgId}
                    organizerName={nameMap.get(orgId) ?? orgId}
                    owedPaise={amount}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Payout history</h2>
        {payoutRows.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-muted">No payouts recorded yet.</div>
        ) : (
          <div className="space-y-2">
            {payoutRows.map((p) => (
              <div key={p.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{p.organizers?.name ?? p.organizer_id.slice(0, 8)}</p>
                    <Badge tone={PAYOUT_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                    {p.method ? (
                      <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase dark:bg-white/10">
                        {p.method}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatPaise(p.amount_paise)}
                    {p.events?.title ? ` · ${p.events.title}` : " · all events"}
                    {" · "}initiated {formatDateTime(p.initiated_at)}
                    {p.completed_at ? ` · done ${formatDateTime(p.completed_at)}` : ""}
                    {p.bank_reference ? ` · ref ${p.bank_reference}` : ""}
                  </p>
                  {p.failure_reason ? (
                    <p className="mt-0.5 text-xs text-red-500">Failed: {p.failure_reason}</p>
                  ) : null}
                </div>
                <PayoutRowActions payoutId={p.id} status={p.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}