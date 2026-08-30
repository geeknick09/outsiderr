import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { QrCode } from "@/components/ui/qr-code";
import { getCurrentUser } from "@/lib/auth";
import { listMyOrders, listMyTickets } from "@/lib/data/orders";
import { formatDateTime, formatPaise } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Tickets — Outsiderr" };

const STATUS_TONE: Record<OrderStatus, "warning" | "success" | "danger" | "neutral"> = {
  PENDING_VERIFICATION: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_VERIFICATION: "Pending verification",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Ftickets");

  const { submitted } = await searchParams;
  const [orders, tickets] = await Promise.all([
    listMyOrders(user),
    listMyTickets(user),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">My Tickets</h1>
        <p className="text-sm text-muted">
          Orders and QR passes for {user.name}.
        </p>
      </div>

      {submitted ? (
        <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          Payment submitted. The organizer will verify your UTR shortly.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Passes</h2>
        {tickets.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">
            No confirmed passes yet. They appear here once the organizer approves your
            payment.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="glass flex gap-4 rounded-3xl p-4">
                <QrCode value={ticket.qrHash} size={104} className="h-26 rounded-xl bg-white p-1.5" />
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-bold">{ticket.eventTitle}</p>
                  <p className="text-xs text-muted">{ticket.tierName}</p>
                  <p className="text-xs text-muted">{formatDateTime(ticket.startsAt)}</p>
                  <p className="text-xs text-muted">{ticket.venueName}</p>
                  <Badge tone={ticket.status === "VALID" ? "success" : "neutral"}>
                    {ticket.status === "VALID" ? "Valid" : ticket.status === "USED" ? "Checked in" : "Void"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Orders</h2>
        {orders.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">
            Nothing here yet.{" "}
            <Link href="/" className="underline hover:text-violet-neon">
              Find something to do
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/events/${order.eventId}`}
                    className="text-sm font-bold hover:text-violet-neon"
                  >
                    {order.eventTitle}
                  </Link>
                  <p className="text-xs text-muted">
                    {order.tierName} × {order.quantity} · {formatPaise(order.totalPaise)}
                  </p>
                  <p className="text-xs text-muted">UTR {order.utrReference ?? "—"}</p>
                  {order.rejectionReason ? (
                    <p className="text-xs text-red-500">{order.rejectionReason}</p>
                  ) : null}
                </div>
                <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
