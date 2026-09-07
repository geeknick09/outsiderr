"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Clock, XCircle, AlertCircle, RefreshCw, Loader2 } from "lucide-react";

import { approveOrderAction, rejectOrderAction } from "@/actions/orders";
import { useRealtime } from "@/lib/hooks/use-realtime";
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
 * Order Monitor — shows all orders for the organizer's events with their payment status.
 *
 * Perf fixes:
 * - Uses useRealtime hook (singleton WebSocket) instead of creating a raw Supabase client
 * - filteredOrders and counts memoized with useMemo
 * - filterTabs memoized with useMemo
 * - Filter buttons use useCallback
 */
export function OrderMonitor({ orders, organizerEventIds }: OrderMonitorProps) {
  const [orderList, setOrderList] = useState(orders);
  const [filter, setFilter] = useState<string>("PENDING_VERIFICATION");
  const [pendingAction, startTransition] = useTransition();

  // Realtime via hook — reuses singleton WebSocket, no new connections on each render
  const realtimeFilter = useMemo(
    () =>
      organizerEventIds.length > 0
        ? `event_id=in.(${organizerEventIds.join(",")})`
        : undefined,
    [organizerEventIds],
  );

  useRealtime({
    channelName: `organizer-order-monitor:${organizerEventIds.join("-")}`,
    table: "orders",
    event: "*",
    filter: realtimeFilter,
    enabled: organizerEventIds.length > 0,
    onPayload: ({ eventType, new: row }) => {
      if (eventType === "INSERT" && row) {
        setOrderList((prev) => {
          if (prev.some((o) => o.id === (row as { id: string }).id)) return prev;
          return [row as unknown as Order, ...prev];
        });
      } else if (eventType === "UPDATE" && row) {
        setOrderList((prev) =>
          prev.map((o) =>
            o.id === (row as { id: string }).id ? { ...o, ...row } : o,
          ),
        );
      }
    },
  });

  // Memoized derived state — recalculates only when orderList or filter changes
  const counts = useMemo(
    () =>
      orderList.reduce(
        (acc, o) => {
          acc[o.status] = (acc[o.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [orderList],
  );

  const filteredOrders = useMemo(
    () => (filter === "ALL" ? orderList : orderList.filter((o) => o.status === filter)),
    [orderList, filter],
  );

  const filterTabs = useMemo(
    () => [
      { key: "ALL", label: `All (${orderList.length})` },
      { key: "PENDING_VERIFICATION", label: `Pending (${counts.PENDING_VERIFICATION ?? 0})` },
      { key: "CONFIRMED", label: `Confirmed (${counts.CONFIRMED ?? 0})` },
      { key: "RESERVED", label: `Reserved (${counts.RESERVED ?? 0})` },
      { key: "REJECTED", label: `Rejected (${counts.REJECTED ?? 0})` },
      { key: "FAILED", label: `Failed (${counts.FAILED ?? 0})` },
      { key: "EXPIRED", label: `Expired (${counts.EXPIRED ?? 0})` },
    ],
    [orderList.length, counts],
  );

  const handleFilter = useCallback((key: string) => setFilter(key), []);

  if (orderList.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-zinc-400" />
        <p className="mt-2 text-sm font-semibold">No orders yet</p>
        <p className="mt-1 text-xs text-muted">
          Orders will appear here automatically when attendees book your events.
          Pending UTR/UPI payments will show up here for you to verify.
        </p>
      </div>
    );
  }

  const filteredHasPending = filteredOrders.some(
    (o) => o.status === "PENDING_VERIFICATION",
  );

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleFilter(tab.key)}
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

      {filteredHasPending ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-bold">Pending payment verifications</p>
          <p className="mt-1 text-xs">
            These attendees have paid via UPI and submitted their booking. Verify their
            payment in your UPI app (match the UTR/amount), then approve to mint their tickets.
            Reject if the payment doesn&apos;t match.
          </p>
        </div>
      ) : null}

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
                <th className="p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">Actions</th>
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
                const isPending = order.status === "PENDING_VERIFICATION";
                return (
                  <tr key={order.id} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                    <td className="p-4">
                      <div className="font-semibold">{order.buyerName ?? "—"}</div>
                      <div className="text-xs text-muted">{order.buyerPhone ?? ""}</div>
                      {order.buyerEmail ? (
                        <div className="text-xs text-muted">{order.buyerEmail}</div>
                      ) : null}
                    </td>
                    <td className="p-4 text-muted">{order.tierName}</td>
                    <td className="p-4 font-semibold">{order.quantity}</td>
                    <td className="p-4 font-semibold">{formatPaise(order.totalPaise)}</td>
                    <td className="p-4 text-xs text-muted">
                      {order.paymentMethod ? (
                        <span className="capitalize">{order.paymentMethod}</span>
                      ) : order.utrReference ? (
                        <span className="font-mono">UTR: {order.utrReference}</span>
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
                    <td className="p-4">
                      {isPending ? (
                        <div className="flex items-center gap-2">
                          <form
                            action={(formData) => {
                              startTransition(async () => {
                                await approveOrderAction(formData);
                                setOrderList((prev) =>
                                  prev.map((o) =>
                                    o.id === order.id ? { ...o, status: "CONFIRMED" } : o,
                                  ),
                                );
                              });
                            }}
                          >
                            <input type="hidden" name="orderId" value={order.id} />
                            <button
                              type="submit"
                              disabled={pendingAction}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              {pendingAction ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              Approve
                            </button>
                          </form>
                          <form
                            action={(formData) => {
                              startTransition(async () => {
                                await rejectOrderAction(formData);
                                setOrderList((prev) =>
                                  prev.map((o) =>
                                    o.id === order.id ? { ...o, status: "REJECTED" } : o,
                                  ),
                                );
                              });
                            }}
                          >
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="reason" value="Payment not verified" />
                            <button
                              type="submit"
                              disabled={pendingAction}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              {pendingAction ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                              Reject
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
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
