import Link from "next/link";

import { Badge } from "@/modules/shared";
import { formatDateTime, formatPaise } from "@/modules/shared";
import { createServiceClient } from "@/modules/shared/server";
import { RefundRowActions, ProcessRefundsButton } from "@/modules/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin: Refunds — Outsiderr" };

const TONE: Record<string, "warning" | "success" | "danger" | "neutral" | "violet"> = {
  REQUESTED: "violet",
  PENDING: "warning",
  INITIATING: "warning",
  INITIATED: "warning",
  COMPLETED: "success",
  MANUAL_SETTLED: "success",
  REJECTED: "danger",
  FAILED: "danger",
};

const FILTER_TABS = [
  { key: "queue", label: "Queue" },
  { key: "all", label: "All" },
  { key: "COMPLETED", label: "Completed" },
  { key: "FAILED", label: "Failed" },
  { key: "REJECTED", label: "Rejected" },
] as const;

type Row = {
  id: string;
  status: string;
  amount_paise: number;
  reason: string;
  refund_scope: string | null;
  initiated_at: string;
  completed_at: string | null;
  razorpay_refund_id: string | null;
  attempts: number;
  last_error: string | null;
  order_id: string | null;
  events: { title: string } | null;
  profiles: { full_name: string } | null;
  orders: { invoice_number: string | null; total_paise: number } | null;
};

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status ?? "queue";

  const supabase = createServiceClient();
  let query = supabase
    .from("refunds")
    .select(
      "id, status, amount_paise, reason, refund_scope, initiated_at, completed_at, razorpay_refund_id, attempts, last_error, order_id, events(title), profiles(full_name), orders(invoice_number, total_paise)",
    )
    .order("initiated_at", { ascending: false })
    .limit(300);

  if (filter === "queue") {
    query = query.in("status", ["REQUESTED", "PENDING", "INITIATING", "INITIATED", "FAILED"] as never);
  } else if (filter !== "all") {
    query = query.eq("status", filter as never);
  }

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Refunds</h1>
          <p className="text-sm text-muted">
            Approve, reject, and track refunds. The worker pushes approved refunds to Razorpay.
          </p>
        </div>
        <ProcessRefundsButton />
      </div>

      <nav className="flex flex-wrap gap-2">
        {FILTER_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "queue" ? "/admin/refunds" : `/admin/refunds?status=${t.key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === t.key
                ? "bg-violet-neon text-white"
                : "bg-zinc-100 text-muted hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center text-sm text-muted">
          No refunds in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold">
                    {r.events?.title ?? "Unknown event"} — {r.profiles?.full_name ?? "Unknown buyer"}
                  </p>
                  <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  {r.refund_scope ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {r.refund_scope}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatPaise(r.amount_paise)}
                  {r.orders?.invoice_number ? ` · ${r.orders.invoice_number}` : ""}
                  {" · "}
                  requested {formatDateTime(r.initiated_at)}
                  {r.attempts > 0 ? ` · ${r.attempts} attempt${r.attempts > 1 ? "s" : ""}` : ""}
                  {r.razorpay_refund_id ? ` · ${r.razorpay_refund_id}` : ""}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">{r.reason}</p>
                {r.last_error ? (
                  <p className="mt-0.5 text-xs text-red-500">Last error: {r.last_error}</p>
                ) : null}
              </div>
              <RefundRowActions refundId={r.id} status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}