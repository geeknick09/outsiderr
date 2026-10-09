import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/modules/shared";
import { formatDateTime, formatPaise } from "@/modules/shared";
import { getCurrentUser } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { createServiceClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transactions - Outsiderr Organizer" };

const PAGE_SIZE = 25;

const TYPE_LABEL: Record<string, string> = {
  TICKET_SALE: "Ticket sale",
  BOOST_SALE: "Boost",
  DOOR_STAFF_SALE: "Door staff",
  CLUB_FEE: "Community membership",
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

type Txn = {
  id: string;
  when: string;
  kind: string;
  label: string;
  eventId: string | null;
  eventTitle: string | null;
  amountPaise: number;
  status: string | null;
  detail: string | null;
};

function queryString(p: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Unified transaction ledger - payments, refunds and payouts in one paginated table. */
export default async function OrganizerLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; event?: string; from?: string; to?: string; sort?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer%2Fledger");

  const organizer = await getOrganizerProfile(user);
  if (!organizer) redirect("/organizer");

  const { page: pageParam, event, from, to, sort } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const oldestFirst = sort === "oldest";

  const supabase = createServiceClient();
  const { data: eventRows } = await supabase
    .from("events")
    .select("id, title")
    .eq("organizer_id", organizer.id)
    .order("starts_at", { ascending: false });
  const eventIds = (eventRows ?? []).map((e) => e.id);

  const [{ data: ledger }, { data: refunds }, { data: payouts }] =
    await Promise.all([
      supabase
        .from("payment_ledger")
        .select("id, type, gross_amount_paise, net_organizer_paise, notes, created_at, event_id, events(title)")
        .eq("organizer_id", organizer.id)
        .order("created_at", { ascending: false })
        .limit(500),
      eventIds.length
        ? supabase
            .from("refunds")
            .select("id, status, amount_paise, reason, initiated_at, event_id, events(title)")
            .in("event_id", eventIds)
            .order("initiated_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] }),
      supabase
        .from("payout_records")
        .select("id, amount_paise, status, bank_reference, initiated_at")
        .eq("organizer_id", organizer.id)
        .order("initiated_at", { ascending: false })
        .limit(100),
    ]);

  // Merge into one transaction list.
  const txns: Txn[] = [];
  for (const r of ledger ?? []) {
    const l = r as unknown as {
      id: string; type: string; gross_amount_paise: number; net_organizer_paise: number;
      notes: string | null; created_at: string; event_id: string | null;
      events: { title: string } | null;
    };
    txns.push({
      id: `l-${l.id}`,
      when: l.created_at,
      kind: l.type,
      label: TYPE_LABEL[l.type] ?? l.type,
      eventId: l.event_id,
      eventTitle: l.events?.title ?? null,
      amountPaise: l.net_organizer_paise,
      status: null,
      detail: l.notes,
    });
  }
  for (const r of refunds ?? []) {
    const f = r as unknown as {
      id: string; status: string; amount_paise: number; reason: string;
      initiated_at: string; event_id: string; events: { title: string } | null;
    };
    txns.push({
      id: `r-${f.id}`,
      when: f.initiated_at,
      kind: "REFUND",
      label: "Refund",
      eventId: f.event_id,
      eventTitle: f.events?.title ?? null,
      amountPaise: -Math.abs(f.amount_paise),
      status: f.status,
      detail: f.reason.replace(/_/g, " ").toLowerCase(),
    });
  }

  txns.sort((a, b) =>
    oldestFirst ? a.when.localeCompare(b.when) : b.when.localeCompare(a.when),
  );

  // Filters
  const filtered = txns.filter((t) => {
    if (event && t.eventId !== event) return false;
    if (from && t.when < `${from}T00:00:00`) return false;
    if (to && t.when > `${to}T23:59:59`) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Net position summary (same math as the old payments page).
  const ledgerRows = (ledger ?? []) as unknown as { type: string; net_organizer_paise: number }[];
  const earned = ledgerRows.filter((r) => r.type !== "PAYOUT" && r.net_organizer_paise > 0)
    .reduce((s, r) => s + r.net_organizer_paise, 0);
  const owed = ledgerRows.filter((r) => r.type !== "PAYOUT" && r.net_organizer_paise < 0)
    .reduce((s, r) => s + r.net_organizer_paise, 0);
  const paidOut = Math.abs(
    ledgerRows.filter((r) => r.type === "PAYOUT").reduce((s, r) => s + r.net_organizer_paise, 0));
  const pendingPayout = (payouts ?? [])
    .filter((p) => p.status === "PENDING" || p.status === "PROCESSING")
    .reduce((s, p) => s + p.amount_paise, 0);
  const netPosition = earned + owed - paidOut - pendingPayout;

  const params = { event, from, to, sort };

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Transactions</h1>
        <p className="text-sm text-muted">
          Every rupee accounted for - sales, refunds, deductions and payouts in one ledger.
        </p>
      </div>

      {/* Net position */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Earned", value: formatPaise(earned) },
          { label: "Refunds & deductions", value: formatPaise(Math.abs(owed)) },
          { label: "Paid out", value: formatPaise(paidOut + pendingPayout), sub: pendingPayout > 0 ? `incl. ${formatPaise(pendingPayout)} in flight` : undefined },
          { label: "Net position", value: formatPaise(netPosition) },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</p>
            <p className="mt-1 text-lg font-black">{s.value}</p>
            {s.sub ? <p className="mt-0.5 text-xs text-muted">{s.sub}</p> : null}
          </div>
        ))}
      </div>

      {/* Filters */}
      <form className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4" action="/organizer/ledger" method="get">
        <label className="min-w-40 flex-1 space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Event</span>
          <select
            name="event"
            defaultValue={event ?? ""}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          >
            <option value="">All events</option>
            {(eventRows ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">From</span>
          <input type="date" name="from" defaultValue={from ?? ""}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">To</span>
          <input type="date" name="to" defaultValue={to ?? ""}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Sort</span>
          <select name="sort" defaultValue={sort ?? "latest"}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-xl bg-neon-gradient px-4 py-2 text-sm font-bold text-white"
        >
          Apply
        </button>
        {(event || from || to || sort) ? (
          <Link href="/organizer/ledger" className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-muted dark:border-white/10">
            Clear
          </Link>
        ) : null}
      </form>

      {/* Table */}
      <div className="glass overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-muted dark:border-white/10">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                    No transactions match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                      {formatDateTime(t.when)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={TYPE_TONE[t.kind] ?? "neutral"}>
                        {t.label}{t.status ? ` · ${t.status}` : ""}
                      </Badge>
                    </td>
                    <td className="max-w-40 truncate px-4 py-3 text-xs">
                      {t.eventTitle ?? "-"}
                    </td>
                    <td className="max-w-56 truncate px-4 py-3 text-xs text-muted">
                      {t.detail ?? "-"}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-bold ${t.amountPaise < 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                      {formatPaise(t.amountPaise)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-3">
          {safePage > 1 ? (
            <Link
              href={`/organizer/ledger${queryString({ ...params, page: String(safePage - 1) })}`}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-muted dark:border-white/10"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-xs font-semibold text-muted">
            Page {safePage} of {pageCount} · {filtered.length} transactions
          </span>
          {safePage < pageCount ? (
            <Link
              href={`/organizer/ledger${queryString({ ...params, page: String(safePage + 1) })}`}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-muted dark:border-white/10"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
