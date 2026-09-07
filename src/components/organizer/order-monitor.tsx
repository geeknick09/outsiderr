"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle, AlertCircle, RefreshCw } from "lucide-react";

import type { Order } from "@/lib/types";

interface OrderMonitorProps {
  orders: Order[];
  organizerEventIds: string[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle2; tone: string }
> = {
  CONFIRMED: { label: "Confirmed", icon: CheckCircle2, tone: "text-emerald-600" },
  RESERVED: { label: "Awaiting payment", icon: Clock, tone: "text-amber-600" },
  PENDING_VERIFICATION: { label: "Pending verification", icon: Clock, tone: "text-amber-600" },
  FAILED: { label: "Failed", icon: XCircle, tone: "text-red-600" },
  EXPIRED: { label: "Expired", icon: XCircle, tone: "text-zinc-500" },
  REJECTED: { label: "Rejected", icon: XCircle, tone: "text-red-600" },
  CANCELLED: { label: "Cancelled", icon: XCircle, tone: "text-zinc-500" },
  REFUNDED: { label: "Refunded", icon: RefreshCw, tone: "text-blue-600" },
};

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Order Monitor — replaces the old VerificationQueue.
 *
 * Shows all orders for the organizer's events with their payment status.
 * Read-only: no approve/reject actions (Razorpay handles confirmation automatically).
 * Legacy PENDING_VERIFICATION orders still show for historical reference.
 */
export function OrderMonitor({ orders, organizerEventIds }: OrderMonitorProps) {
  const [orderList, setOrderList] = useState(orders);
  const [filter, setFilter] = useState<string>("ALL");

  // Realtime: listen for order updates
  useEffect(() => {
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      const channel = supabase
        .channel("organizer-order-monitor")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `event_id=in.(${organizerEventIds.join(",")})`,
          },
          (payload) => {
            if (payload.eventType === "INSERT" && payload.new) {
              setOrderList((prev) => {
                if (prev.some((o) => o.id === (payload.new as { id: string }).id)) return prev;
                return [payload.new as Order, ...prev];
              });
            } else if (payload.eventType === "UPDATE" && payload.new) {
              setOrderList((prev) =>
                prev.map((o) =>
                  o.id === (payload.new as { id: string }).id
                    ? { ...o, ...payload.new }
                    : o,
                ),
              );
            }
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    });
  }, [organizerEventIds]);

  const filteredOrders =
    filter === "ALL" ? orderList : orderList.filter((o) => o.status === filter);

  const counts = orderList.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const filterTabs = [
    { key: "ALL", label: `All (${orderList.length})` },
    { key: "RESERVED", label: `Awaiting (${counts.RESERVED ?? 0})` },
    { key: "CONFIRMED", label: `Confirmed (${counts.CONFIRMED ?? 0})` },
    { key: "PENDING_VERIFICATION", label: `Legacy (${counts.PENDING_VERIFICATION ?? 0})` },
    { key: "FAILED", label: `Failed (${counts.FAILED ?? 0})` },
    { key: "EXPIRED", label: `Expired (${counts.EXPIRED ?? 0})` },
  ];

  if (orderList.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-zinc-400" />
        <p className="mt-2 text-sm font-semibold">No orders yet</p>
        <p className="mt-1 text-xs text-muted">
          Orders will appear here automatically when attendees book your events.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === tab.key
                ? "bg-violet-neon text-white"
                : "bg-zinc-100 text-muted hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="glass overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
              <tr>
                <th className="p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">Attendee</th>
                <th className="p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">Tier</th>
                <th className="p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">Qty</th>
                <th className="p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">Amount</th>
                <th className="p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">Payment</th>
                <th className="p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {filteredOrders.map((order) => {
                const cfg = STATUS_CONFIG[order.status] ?? {
                  label: order.status,
                  icon: AlertCircle,
                  tone: "text-zinc-500",
                };
                const Icon = cfg.icon;
                return (
                  <tr key={order.id} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                    <td className="p-4">
                      <div className="font-semibold">{order.buyerName ?? "—"}</div>
                      <div className="text-xs text-muted">{order.buyerPhone ?? ""}</div>
                    </td>
                    <td className="p-4 text-muted">{order.tierName}</td>
                    <td className="p-4 font-semibold">{order.quantity}</td>
                    <td className="p-4 font-semibold">{formatPaise(order.totalPaise)}</td>
                    <td className="p-4 text-xs text-muted">
                      {order.paymentMethod ? (
                        <span className="capitalize">{order.paymentMethod}</span>
                      ) : order.utrReference ? (
                        <span>UPI: {order.utrReference.slice(0, 8)}…</span>
                      ) : (
                        <span>—</span>
                      )}
                      {order.razorpayPaymentId ? (
                        <div className="text-[10px] text-zinc-400">{order.razorpayPaymentId.slice(0, 16)}…</div>
                      ) : null}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cfg.tone}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-muted">{formatTime(order.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
