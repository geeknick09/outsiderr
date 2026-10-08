import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/modules/shared";
import { formatDateTime, formatPaise } from "@/modules/shared";
import { getCurrentUser } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { createServiceClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Refunds - Outsiderr Organizer" };

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

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Under review",
  PENDING: "Approved · processing",
  INITIATING: "Approved · processing",
  INITIATED: "Sent to gateway",
  COMPLETED: "Refunded",
  MANUAL_SETTLED: "Settled manually",
  REJECTED: "Rejected",
  FAILED: "Failed",
};

type Row = {
  id: string;
  status: string;
  amount_paise: number;
  reason: string;
  refund_scope: string | null;
  initiated_at: string;
  completed_at: string | null;
  event_id: string;
  events: { title: string } | null;
  profiles: { full_name: string } | null;
  orders: { invoice_number: string | null } | null;
};

/** Organizer refund dashboard - refunds against their events (view + request). */
export default async function OrganizerRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer%2Frefunds");

  const organizer = await getOrganizerProfile(user);
  if (!organizer) redirect("/organizer");

  const { status } = await searchParams;
  const filter = status ?? "queue";

  const supabase = createServiceClient();
  const { data: eventRows } = await supabase
    .from("events")
    .select("id")
    .eq("organizer_id", organizer.id);
  const eventIds = (eventRows ?? []).map((e) => e.id);

  let rows: Row[] = [];
  if (eventIds.length) {
    let query = supabase
      .from("refunds")
      .select(
        "id, status, amount_paise, reason, refund_scope, initiated_at, completed_at, event_id, events(title), profiles(full_name), orders(invoice_number)",
      )
      .in("event_id", eventIds)
      .order("initiated_at", { ascending: false })
      .limit(200);
    if (filter === "queue") {
      query = query.in("status", ["REQUESTED", "PENDING", "INITIATING", "INITIATED"] as never);
    } else if (filter !== "all") {
      query = query.eq("status", filter as never);
    }
    const { data } = await query;
    rows = (data ?? []) as unknown as Row[];
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Refunds</h1>
          <p className="text-sm text-muted">
            Refund requests against your events - approvals are handled by the
            Outsiderr team and pushed through automatically.
          </p>
        </div>
        <Link href="/organizer" className="text-sm text-muted hover:text-violet-neon">
          ← Back to dashboard
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2">
        {[
          { key: "queue", label: "In progress" },
          { key: "COMPLETED", label: "Completed" },
          { key: "REJECTED", label: "Rejected" },
          { key: "all", label: "All" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.key === "queue" ? "/organizer/refunds" : `/organizer/refunds?status=${t.key}`}
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
                  <Link href={`/organizer/events/${r.event_id}`} className="text-sm font-bold hover:text-violet-neon">
                    {r.events?.title ?? "Unknown event"}
                  </Link>
                  <Badge tone={TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {r.profiles?.full_name ?? "Buyer"} · {formatPaise(r.amount_paise)}
                  {r.orders?.invoice_number ? ` · ${r.orders.invoice_number}` : ""}
                  {" · "}{formatDateTime(r.initiated_at)}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">{r.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}