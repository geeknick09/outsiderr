import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin: Payouts — Outsiderr" };

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAYOUT_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  PROCESSING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
};

export default async function AdminPayoutsPage() {
  let payouts: Array<{
    id: string;
    organizer_id: string;
    event_id: string | null;
    amount_paise: number;
    status: string;
    bank_reference: string | null;
    notes: string | null;
    initiated_at: string;
    completed_at: string | null;
  }> = [];

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("payout_records")
      .select("id, organizer_id, event_id, amount_paise, status, bank_reference, notes, initiated_at, completed_at")
      .order("initiated_at", { ascending: false })
      .limit(100);
    payouts = data ?? [];
  } catch (err) {
    console.error("Admin payouts page error:", err);
  }

  const totalPending = payouts
    .filter((p) => p.status === "PENDING")
    .reduce((sum, p) => sum + p.amount_paise, 0);
  const totalCompleted = payouts
    .filter((p) => p.status === "COMPLETED")
    .reduce((sum, p) => sum + p.amount_paise, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Organizer Payouts</h1>
        <p className="text-sm text-muted">
          Track and record manual bank transfers to organizers.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-3xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total Payouts</p>
          <p className="mt-1 text-2xl font-black">{payouts.length}</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pending</p>
          <p className="mt-1 text-2xl font-black text-amber-500">{formatPaise(totalPending)}</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Completed</p>
          <p className="mt-1 text-2xl font-black text-emerald-500">{formatPaise(totalCompleted)}</p>
        </div>
      </div>

      {/* Payouts list */}
      <div className="glass rounded-3xl p-5">
        <h2 className="mb-3 text-base font-bold">Payout History</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted">No payouts recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 dark:border-white/10">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Organizer</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Amount</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Status</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Bank Ref</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Initiated</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3 font-mono text-xs">{p.organizer_id.slice(0, 8)}…</td>
                    <td className="p-3 font-semibold">{formatPaise(p.amount_paise)}</td>
                    <td className="p-3">
                      <Badge tone={PAYOUT_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                    </td>
                    <td className="p-3 text-xs text-muted">{p.bank_reference ?? "—"}</td>
                    <td className="p-3 text-xs text-muted">{formatDateTime(p.initiated_at)}</td>
                    <td className="p-3 text-xs text-muted">
                      {p.completed_at ? formatDateTime(p.completed_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
