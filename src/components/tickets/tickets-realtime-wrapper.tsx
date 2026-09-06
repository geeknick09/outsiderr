"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { TicketCard } from "@/components/tickets/ticket-card";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { formatPaise } from "@/lib/format";
import type { Order, OrderStatus, Ticket } from "@/lib/types";

const STATUS_TONE: Record<OrderStatus, "warning" | "success" | "danger" | "neutral"> = {
  PENDING_VERIFICATION: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_VERIFICATION: "Pending verification",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export function TicketsRealtimeWrapper({
  userId,
  userName,
  whatsappNumber,
  submitted,
  initialOrders,
  initialTickets,
}: {
  userId: string;
  userName: string;
  whatsappNumber: string;
  submitted: boolean;
  initialOrders: Order[];
  initialTickets: Ticket[];
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);

  // Realtime: order status changes (e.g. PENDING_VERIFICATION → CONFIRMED)
  useRealtime({
    channelName: `user-orders:${userId}`,
    table: "orders",
    event: "UPDATE",
    filter: `user_id=eq.${userId}`,
    enabled: !!userId,
    onPayload: ({ new: row }) => {
      const newStatus = row.status as OrderStatus;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === row.id ? { ...o, status: newStatus, rejectionReason: (row.rejection_reason as string) ?? null } : o,
        ),
      );
      // If order just got confirmed, refresh to fetch the newly minted ticket
      if (newStatus === "CONFIRMED") {
        router.refresh();
      }
    },
  });

  // Realtime: new ticket minted (on order approval)
  useRealtime({
    channelName: `user-tickets-insert:${userId}`,
    table: "tickets",
    event: "INSERT",
    filter: `user_id=eq.${userId}`,
    enabled: !!userId,
    onPayload: () => {
      // Refresh to fetch the full ticket with joined data (event title, tier name, etc.)
      router.refresh();
    },
  });

  // Realtime: ticket status changes (scanned, cancelled)
  useRealtime({
    channelName: `user-tickets-update:${userId}`,
    table: "tickets",
    event: "UPDATE",
    filter: `user_id=eq.${userId}`,
    enabled: !!userId,
    onPayload: ({ new: row }) => {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === row.id
            ? { ...t, status: row.status as Ticket["status"], checkedInAt: (row.checked_in_at as string) ?? null }
            : t,
        ),
      );
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">My Tickets</h1>
        <p className="text-sm text-muted">
          Orders and QR passes for {userName}.
        </p>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-300">
          <p className="text-base font-black">✓ Booking done!</p>
          <p className="mt-1">
            Send your payment screenshot to{" "}
            <a
              href={`https://wa.me/91${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline"
            >
              +91 {whatsappNumber}
            </a>{" "}
            on WhatsApp. Your ticket will be shared via email or WhatsApp after the
            organizer confirms your payment.
          </p>
        </div>
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
              <TicketCard key={ticket.id} ticket={ticket} />
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
