import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, formatDateTime, formatPaise } from "@/modules/shared";
import { createServiceClient, getEvent } from "@/modules/shared/server";
import { getEventAnalytics } from "@/modules/analytics/server";
import { cityLabel } from "@/modules/shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin: Event Analytics - Outsiderr" };

const TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "violet"> = {
  PUBLISHED: "success",
  DRAFT: "neutral",
  POSTPONED: "warning",
  CANCELLED: "danger",
  COMPLETED: "violet",
};

export default async function AdminEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, a] = await Promise.all([getEvent(id), getEventAnalytics(id)]);
  if (!event) notFound();

  const supabase = createServiceClient();
  const [{ count: views }, { data: warmViews }] = await Promise.all([
    supabase
      .from("page_views")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", "EVENT")
      .eq("entity_id", id),
    supabase
      .from("page_views")
      .select("user_id")
      .eq("entity_type", "EVENT")
      .eq("entity_id", id),
  ]);
  const viewers = [...new Set((warmViews ?? []).map((v) => v.user_id))];
  const { data: buyerRows } = viewers.length
    ? await supabase.from("orders").select("user_id").eq("event_id", id).eq("status", "CONFIRMED")
    : { data: [] };
  const buyers = new Set((buyerRows ?? []).map((o) => o.user_id));
  const warmCount = viewers.filter((v) => !buyers.has(v)).length;

  const convPct = (views ?? 0) > 0 ? Math.round((a.confirmedOrders / (views ?? 1)) * 100) : 0;

  const stats = [
    { label: "Confirmed orders", value: a.confirmedOrders },
    { label: "Pending orders", value: a.pendingOrders },
    { label: "Gross revenue", value: formatPaise(a.grossRevenuePaise) },
    { label: "Commission (platform)", value: formatPaise(a.commissionPaise) },
    { label: "Convenience fee", value: formatPaise(a.convenienceFeePaise) },
    { label: "Platform total", value: formatPaise(a.platformFeePaise) },
    { label: "Net payout (organizer)", value: formatPaise(a.netPayoutPaise) },
    { label: "Check-ins", value: a.checkIns },
    { label: "Waitlist", value: a.waitlistCount },
    { label: "Page views", value: views ?? 0 },
    { label: "View→order conv.", value: `${convPct}%` },
    { label: "Viewed, not bought", value: warmCount },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <Link href="/admin/events" className="text-xs font-semibold text-violet-neon hover:underline">
        ← Events
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight">{event.title}</h1>
        <Badge tone={TONE[event.status] ?? "neutral"}>{event.status}</Badge>
      </div>
      <p className="text-sm text-muted">
        {event.organizer?.name ?? ""} · {cityLabel(event.city)} · {formatDateTime(event.startsAt)}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4">
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <p className="px-5 pt-4 text-sm font-bold">Tiers</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-muted dark:border-white/10">
              <th className="px-4 py-2.5">Tier</th>
              <th className="px-4 py-2.5">Price</th>
              <th className="px-4 py-2.5">Sold / Qty</th>
              <th className="px-4 py-2.5">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {a.tierBreakdown.map((t) => (
              <tr key={t.tierId} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                <td className="px-4 py-2.5 font-semibold">{t.tierName}</td>
                <td className="px-4 py-2.5">{formatPaise(t.pricePaise)}</td>
                <td className="px-4 py-2.5">
                  {t.quantitySold} / {t.quantity}
                </td>
                <td className="px-4 py-2.5">{formatPaise(t.pricePaise * t.quantitySold)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {a.salesByDay.length ? (
        <div className="glass overflow-hidden rounded-3xl">
          <p className="px-5 pt-4 text-sm font-bold">Sales by day</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-muted dark:border-white/10">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Orders</th>
                <th className="px-4 py-2.5">Tickets</th>
                <th className="px-4 py-2.5">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {a.salesByDay.map((d) => (
                <tr key={d.date} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                  <td className="px-4 py-2.5">{d.date}</td>
                  <td className="px-4 py-2.5">{d.orders}</td>
                  <td className="px-4 py-2.5">{d.tickets}</td>
                  <td className="px-4 py-2.5">{formatPaise(d.revenuePaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
