"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/modules/shared";
import { TicketCard } from "./ticket-card";
import { PostponementRefundButton } from "./postponement-refund-button";
import { RefundStatusStrip } from "./refund-status-strip";
import { useRealtime } from "@/modules/shared";
import { formatPaise } from "@/modules/shared";
import type { Order, OrderStatus, Ticket } from "@/modules/shared";
import type { Refund } from "@/modules/shared/server";

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

export function TicketsRealtimeWrapper({
  userId,
  userName,
  submitted,
  initialOrders,
  initialTickets,
  initialRefunds = [],
}: {
  userId: string;
  userName: string;
  whatsappNumber?: string; // kept for call-site compat - unused post-Razorpay
  submitted: boolean;
  initialOrders: Order[];
  initialTickets: Ticket[];
  initialRefunds?: Refund[];
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [refunds, setRefunds] = useState<Refund[]>(initialRefunds);

  const refundsByOrder = useMemo(() => {
    const map = new Map<string, Refund>();
    for (const r of refunds) {
      if (r.orderId) map.set(r.orderId, r);
    }
    return map;
  }, [refunds]);

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
            ? {
                ...o,
                status: newStatus,
                rejectionReason: (row.rejection_reason as string) ?? null,
                refundOffered: (row.refund_offered as boolean) ?? false,
                refundOfferReason: (row.refund_offer_reason as string) ?? null,
              }
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
        // New ticket minted - refresh for full joined data (event title, tier name, etc.)
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

  // Channel 3: refund status changes - keeps the strip live as the refund
  // pipeline moves REQUESTED → PENDING → INITIATED → COMPLETED/FAILED.
  useRealtime({
    channelName: `user-refunds:${userId}`,
    table: "refunds",
    event: "*",
    filter: `user_id=eq.${userId}`,
    enabled: !!userId,
    onPayload: ({ eventType, new: row }) => {
      if (eventType === "INSERT" || eventType === "UPDATE") {
        setRefunds((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          const mapped: Refund = {
            id: row.id as string,
            orderId: (row.order_id as string) ?? null,
            eventId: row.event_id as string,
            userId: row.user_id as string,
            amountPaise: row.amount_paise as number,
            platformFeePaise: row.platform_fee_paise as number,
            status: row.status as Refund["status"],
            reason: row.reason as string,
            initiatedAt: row.initiated_at as string,
            completedAt: (row.completed_at as string) ?? null,
            razorpayRefundId: (row.razorpay_refund_id as string) ?? null,
            razorpayPaymentId: (row.razorpay_payment_id as string) ?? null,
            refundScope: (row.refund_scope as Refund["refundScope"]) ?? null,
            requestedBy: (row.requested_by as string) ?? null,
            approvedBy: (row.approved_by as string) ?? null,
            approvedAt: (row.approved_at as string) ?? null,
            rejectedReason: (row.rejected_reason as string) ?? null,
            claimedAt: (row.claimed_at as string) ?? null,
            attempts: (row.attempts as number) ?? 0,
            lastError: (row.last_error as string) ?? null,
            receipt: (row.receipt as string) ?? null,
            intentId: (row.intent_id as string) ?? null,
          };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = mapped;
            return next;
          }
          return [mapped, ...prev];
        });
      }
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">My Tickets</h1>
        <p className="text-sm text-muted">Orders and QR passes for {userName}.</p>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-300">
          <p className="text-base font-black">Booking submitted</p>
          <p className="mt-1">
            Your tickets will appear here as soon as the payment confirms -
            usually within a few seconds.
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
            {orders.map((order) => {
              const refund = order.id ? refundsByOrder.get(order.id) : undefined;
              return (
                <div
                  key={order.id}
                  className="glass rounded-3xl p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                      {order.invoiceNumber ? (
                        <p className="text-xs text-muted">{order.invoiceNumber}</p>
                      ) : order.utrReference ? (
                        <p className="text-xs text-muted">UTR {order.utrReference}</p>
                      ) : null}
                      {order.rejectionReason ? (
                        <p className="text-xs text-red-500">{order.rejectionReason}</p>
                      ) : null}
                    </div>
                    <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                    {order.refundOffered &&
                    order.status === "CONFIRMED" &&
                    order.id ? (
                      <PostponementRefundButton
                        orderId={order.id}
                        eventId={order.eventId}
                        eventTitle={order.eventTitle}
                        reason={order.refundOfferReason ?? null}
                      />
                    ) : null}
                  </div>
                  {refund ? <RefundStatusStrip refund={refund} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
