import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getEventAnalytics, listEventOrders, listEventTickets } from "@/lib/data/admin";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { formatDateTime, formatPaise } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const event = await getEvent((await params).id);
  return { title: event ? `Report: ${event.title} — Outsiderr` : "Report — Outsiderr" };
}

export default async function EventReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const organizer = await getOrganizerProfile(user);
  if (!organizer) notFound();

  const [event, analytics, orders, tickets] = await Promise.all([
    getEvent(id),
    getEventAnalytics(id),
    listEventOrders(id),
    listEventTickets(id),
  ]);

  if (!event) notFound();

  const confirmedOrders = orders.filter((o) => o.status === "CONFIRMED");
  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  return (
    <div className="min-h-screen bg-white px-8 py-10 text-zinc-900 dark:bg-white dark:text-zinc-900">
      {/* Print button — hidden when printing */}
      <div className="mb-8 flex items-center justify-between print:hidden">
        <p className="text-sm text-zinc-500">Print or save as PDF with Ctrl+P / ⌘+P</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-700"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Report header */}
      <div className="mb-8 border-b border-zinc-200 pb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Outsiderr · Event Report
        </p>
        <h1 className="text-3xl font-black">{event.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {formatDateTime(event.startsAt)} · {event.venueName}, {event.city}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Organizer: {organizer.name} · Generated: {generatedAt}
        </p>
      </div>

      {/* Revenue summary */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-bold">Revenue Summary</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-zinc-100">
              <td className="py-2 text-zinc-500">Total orders</td>
              <td className="py-2 text-right font-semibold">{analytics.totalOrders}</td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-2 text-zinc-500">Confirmed orders</td>
              <td className="py-2 text-right font-semibold">{analytics.confirmedOrders}</td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-2 text-zinc-500">Pending verification</td>
              <td className="py-2 text-right font-semibold">{analytics.pendingOrders}</td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-2 text-zinc-500">Gross revenue</td>
              <td className="py-2 text-right font-semibold">
                {formatPaise(analytics.grossRevenuePaise)}
              </td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-2 text-zinc-500">Platform fee (5%)</td>
              <td className="py-2 text-right font-semibold text-zinc-400">
                − {formatPaise(analytics.platformFeePaise)}
              </td>
            </tr>
            <tr className="border-b-2 border-zinc-300">
              <td className="py-3 font-bold">Net payout</td>
              <td className="py-3 text-right text-lg font-black">
                {formatPaise(analytics.netPayoutPaise)}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-zinc-500">Check-ins</td>
              <td className="py-2 text-right font-semibold">{analytics.checkIns}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Confirmed orders */}
      {confirmedOrders.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold">Confirmed Orders</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="pb-2 pr-4">Order ID</th>
                <th className="pb-2 pr-4">Buyer</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Qty</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2">UTR</th>
              </tr>
            </thead>
            <tbody>
              {confirmedOrders.map((order) => (
                <tr key={order.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-400">
                    {order.id.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-4">{order.buyerName ?? "—"}</td>
                  <td className="py-2 pr-4">{order.tierName}</td>
                  <td className="py-2 pr-4">{order.quantity}</td>
                  <td className="py-2 pr-4">{formatPaise(order.totalPaise)}</td>
                  <td className="py-2 font-mono text-xs">{order.utrReference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* Ticket check-ins */}
      {tickets.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold">Attendee Tickets</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="pb-2 pr-4">Ticket ID</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Check-in time</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-400">
                    {ticket.id.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-4">{ticket.tierName}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        ticket.status === "USED"
                          ? "font-semibold text-emerald-600"
                          : ticket.status === "VOID"
                          ? "text-red-500"
                          : "text-zinc-500"
                      }
                    >
                      {ticket.status === "USED"
                        ? "Checked in"
                        : ticket.status === "VOID"
                        ? "Void"
                        : "Valid"}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-zinc-400">
                    {ticket.checkedInAt ? formatDateTime(ticket.checkedInAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <p className="mt-12 text-center text-xs text-zinc-300">
        Outsiderr · {event.title} · {generatedAt}
      </p>
    </div>
  );
}
