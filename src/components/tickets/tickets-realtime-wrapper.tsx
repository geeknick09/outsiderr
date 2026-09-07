"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { TicketCard } from "@/components/tickets/ticket-card";
import { PostponementRefundButton } from "@/components/tickets/postponement-refund-button";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { formatPaise } from "@/lib/format";
import type { Order, OrderStatus, Ticket } from "@/lib/types";

const STATUS_TONE: Record<OrderStatus, "warning" | "success" | "danger" | "neutral" | "violet"> = {
  PENDING_VERIFICATION: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
  RESERVED: "warning",
  EXPIRED: "neutral",
  FAILED: "danger",
  REFUND_REQUESTED: "violet",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_VERIFICATION: "Pending verification",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  RESERVED: "Awaiting payment",
  EXPIRED: "Expired",
  FAILED: "Failed",
  REFUND_REQUESTED: "Refund requested",
};

// Format event dates once, not inside the render loop
const dateFormatter = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata" });
function formatEventDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

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

  // Channel 1: order status changes (e.g. PENDING_VERIFICATION → CONFIRMED)
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
          o.id === row.id
            ? { ...o, status: newStatus, rejectionReason: (row.rejection_reason as string) ?? null }
            : o,
        ),
      );
      // Refresh to fetch newly minted ticket when order is confirmed
      if (newStatus === "CONFIRMED") {
        router.refresh();
      }
    },
  });

  // Channel 2: ticket changes (INSERT = new ticket minted; UPDATE = scanned/cancelled)
  // Consolidated from two separate channels into one "*" channel
  useRealtime({
    channelName: `user-tickets:${userId}`,
    table: "tickets",
    event: "*",
    filter: `user_id=eq.${userId}`,
    enabled: !!userId,
    onPayload: ({ eventType, new: row }) => {
      if (eventType === "INSERT") {
        // New ticket minted — refresh for full joined data (event title, tier name, etc.)
        router.refresh();
      } else if (eventType === "UPDATE") {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === row.id
              ? { ...t, status: row.status as Ticket["status"], checkedInAt: (row.checked_in_at as string) ?? null }
              : t,
          ),
        );
      }
    },
  });

  // Memoize formatted dates so they don't recompute on every render
  const formattedOrderDates = useMemo(
    () =>
      new Map(
        orders
          .filter((o) => o.eventStartsAt)
          .map((o) => [o.id, formatEventDate(o.eventStartsAt!)]),
      ),
    [orders],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">My Tickets</h1>
        <p className="text-sm text-muted">Orders and QR passes for {userName}.</p>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-700 dark:text-amber-300">
          <p className="text-base font-black">Booking submitted — pending verification</p>
          <p className="mt-1">
            Your booking is done and is pending payment verification by the organizer.
            Once verified, your tickets will be visible here.
          </p>
          <p className="mt-2 text-xs">
            Send your payment screenshot to{" "}
            <a
              href={`https://wa.me/91${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline"
            >
              +91 {whatsappNumber}
            </a>{" "}
            on WhatsApp for faster verification.
          </p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Passes</h2>
        {tickets.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">
            No confirmed passes yet. They appear here once the organizer approves your payment.
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
                {order.eventStatus === "POSTPONED" &&
                order.status === "CONFIRMED" &&
                order.eventStartsAt ? (
                  <PostponementRefundButton
                    eventId={order.eventId}
                    eventTitle={order.eventTitle}
                    newDate={formattedOrderDates.get(order.id) ?? order.eventStartsAt}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
