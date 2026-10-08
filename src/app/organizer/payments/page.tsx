import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/modules/shared";
import { formatDateTime, formatPaise } from "@/modules/shared";
import { getCurrentUser } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { createServiceClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments & settlement - Outsiderr Organizer" };

const TYPE_LABEL: Record<string, string> = {
  TICKET_SALE: "Ticket sale",
  BOOST_SALE: "Boost",
  DOOR_STAFF_SALE: "Door staff",
  CLUB_FEE: "Club membership",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
  PAYOUT: "Payout",
};

const TYPE_TONE: Record<string, "warning" | "success" | "danger" | "neutral" | "violet"> = {
  TICKET_SALE: "success",
  BOOST_SALE: "neutral",
  DOOR_STAFF_SALE: "neutral",
  CLUB_FEE: "neutral",
  REFUND: "warning",
  ADJUSTMENT: "violet",
  PAYOUT: "success",
};

const PAYOUT_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  PROCESSING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
};

type LedgerRow = {
  id: string;
  type: string;
  gross_amount_paise: number;
  net_organizer_paise: number;
  net_platform_paise: number;
  razorpay_payment_id: string | null;
  notes: string | null;
  created_at: string;
  events: { title: string } | null;
};

type PayoutRow = {
  id: string;
  amount_paise: number;
  status: string;
  bank_reference: string | null;
  notes: string | null;
  initiated_at: string;
  completed_at: string | null;
  events: { title: string } | null;
};

/** Organizer money view: net payout position + ledger + settlement records. */
export default async function OrganizerPaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer%2Fpayments");

  const organizer = await getOrganizerProfile(user);
  if (!organizer) redirect("/organizer");

  const supabase = createServiceClient();
  const [{ data: ledger }, { data: payouts }] = await Promise.all([
    supabase
      .from("payment_ledger")
      .select(
        "id, type, gross_amount_paise, net_organizer_paise, razorpay_payment_id, notes, created_at, events(title)",
      )
      .eq("organizer_id", organizer.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("payout_records")
      .select("id, amount_paise, status, bank_reference, notes, initiated_at, completed_at, events(title)")
      .eq("organizer_id", organizer.id)
      .order("initiated_at", { ascending: false })
      .limit(50),
  ]);

  const ledgerRows = (ledger ?? []) as unknown as LedgerRow[];
  const payoutRows = (payouts ?? []) as unknown as PayoutRow[];

  // PAYOUT rows are negative net_organizer (money left) - excluded from
  // liabilities. Balance = Σ net_organizer − payouts still in flight.
  const earned = ledgerRows
    .filter((r) => r.type !== "PAYOUT" && r.net_organizer_paise > 0)
    .reduce((s, r) => s + r.net_organizer_paise, 0);
  const owed = ledgerRows
    .filter((r) => r.type !== "PAYOUT" && r.net_organizer_paise < 0)
    .reduce((s, r) => s + r.net_organizer_paise, 0);
  const paidOut = Math.abs(
    ledgerRows.filter((r) => r.type === "PAYOUT").reduce((s, r) => s + r.net_organizer_paise, 0),
  );
  const pendingPayout = payoutRows
    .filter((p) => p.status === "PENDING" || p.status === "PROCESSING")
    .reduce((s, p) => s + p.amount_paise, 0);
  const netPosition = earned + owed - paidOut - pendingPayout;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Payments &amp; settlement</h1>
          <p className="text-sm text-muted">
            Every rupee accounted for - sales, deductions, refunds and payouts against your events.
          </p>
        </div>
        <Link href="/organizer" className="text-sm text-muted hover:text-violet-neon">
          ← Back to dashboard
        </Link>
      </div>

      {/* Settlement summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Gross earned" value={formatPaise(earned)} />
        <SummaryCard label="Liabilities" value={formatPaise(-owed)} tone="warn" />
        <SummaryCard label="Paid out" value={formatPaise(paidOut)} />
        <SummaryCard
          label={netPosition >= 0 ? "Balance due" : "You owe"}
          value={formatPaise(Math.abs(netPosition))}
          tone={netPosition >= 0 ? "good" : "bad"}
        />
      </div>
      {pendingPayout > 0 ? (
        <p className="text-xs text-muted">
          {formatPaise(pendingPayout)} is in a pending/processing payout.
        </p>
      ) : null}

      {/* Payouts */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Payouts</h2>
        {payoutRows.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-muted">
            No payouts yet - they appear here once the team settles your earnings.
          </div>
        ) : (
          <div className="space-y-2">
            {payoutRows.map((p) => (
              <div key={p.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
                <div>
                  <p className="text-sm font-bold">{formatPaise(p.amount_paise)}</p>
                  <p className="text-xs text-muted">
                    {p.events?.title ? `${p.events.title} · ` : ""}
                    initiated {formatDateTime(p.initiated_at)}
                    {p.bank_reference ? ` · ${p.bank_reference}` : ""}
                  </p>
                </div>
                <Badge tone={PAYOUT_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ledger */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Transaction ledger</h2>
        {ledgerRows.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-muted">No transactions yet.</div>
        ) : (
          <div className="glass overflow-hidden rounded-2xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 dark:border-white/10">
                <tr>
                  <th className="px-3 py-2 font-semibold text-muted">Type</th>
                  <th className="hidden px-3 py-2 font-semibold text-muted sm:table-cell">Event</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted">Gross</th>
                  <th className="hidden px-3 py-2 text-right font-semibold text-muted md:table-cell">Deductions</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted">You get</th>
                  <th className="hidden px-3 py-2 font-semibold text-muted lg:table-cell">Ref</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((r) => {
                  const deductions = r.type === "TICKET_SALE" ? Math.abs(r.gross_amount_paise) - r.net_organizer_paise : 0;
                  return (
                    <tr key={r.id} className="border-b border-zinc-100 dark:border-white/5">
                      <td className="px-3 py-2">
                        <Badge tone={TYPE_TONE[r.type] ?? "neutral"}>{TYPE_LABEL[r.type] ?? r.type}</Badge>
                      </td>
                      <td className="hidden max-w-[160px] truncate px-3 py-2 text-muted sm:table-cell">
                        {r.events?.title ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.gross_amount_paise ? formatPaise(Math.abs(r.gross_amount_paise)) : "-"}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono text-muted md:table-cell">
                        {deductions ? formatPaise(deductions) : "-"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-bold ${
                          r.net_organizer_paise >= 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {r.net_organizer_paise
                          ? `${r.net_organizer_paise < 0 ? "−" : ""}${formatPaise(Math.abs(r.net_organizer_paise))}`
                          : "-"}
                      </td>
                      <td className="hidden px-3 py-2 font-mono text-[10px] text-muted lg:table-cell">
                        {r.razorpay_payment_id ? r.razorpay_payment_id.slice(0, 16) : r.notes ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 text-lg font-black ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-500" : tone === "warn" ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}