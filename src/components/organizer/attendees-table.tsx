"use client";

import { useState } from "react";
import { Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatPaise } from "@/lib/format";
import type { Order, Ticket } from "@/lib/types";

type FilterKey = "all" | "confirmed" | "checked_in" | "pending" | "rejected" | "cancelled";

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked In" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

export function AttendeesTable({
  orders,
  tickets,
}: {
  orders: Order[];
  tickets: Ticket[];
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  // Build a set of order IDs that have at least one checked-in ticket
  const checkedInOrderIds = new Set(
    tickets.filter((t) => t.status === "USED").map((t) => t.orderId),
  );

  const filtered = orders.filter((order) => {
    switch (filter) {
      case "confirmed":
        return order.status === "CONFIRMED";
      case "checked_in":
        return checkedInOrderIds.has(order.id);
      case "pending":
        return order.status === "PENDING_VERIFICATION";
      case "rejected":
        return order.status === "REJECTED";
      default:
        return true;
    }
  });

  const counts: Record<FilterKey, number> = {
    all: orders.length,
    confirmed: orders.filter((o) => o.status === "CONFIRMED").length,
    checked_in: orders.filter((o) => checkedInOrderIds.has(o.id)).length,
    pending: orders.filter((o) => o.status === "PENDING_VERIFICATION").length,
    rejected: orders.filter((o) => o.status === "REJECTED").length,
    cancelled: orders.filter((o) => o.status === "CANCELLED").length,
  };

  return (
    <div className="space-y-3">
      {/* Filter tabs + print */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.value
                  ? "bg-violet-neon text-white"
                  : "border border-zinc-200 text-muted hover:border-violet-neon dark:border-white/10"
              }`}
            >
              {f.label} ({counts[f.value]})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 print:hidden"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-5 text-sm text-muted">
          No bookings in this category.
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-zinc-200 dark:border-white/10">
              <tr>
                <th className="px-3 py-2 font-semibold text-muted">Buyer</th>
                <th className="hidden px-3 py-2 font-semibold text-muted sm:table-cell">Tier</th>
                <th className="px-3 py-2 font-semibold text-muted">Pax</th>
                <th className="hidden px-3 py-2 font-semibold text-muted sm:table-cell">Total</th>
                <th className="px-3 py-2 font-semibold text-muted">Status</th>
                <th className="hidden px-3 py-2 font-semibold text-muted md:table-cell">UTR</th>
                <th className="hidden px-3 py-2 font-semibold text-muted md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const isCheckedIn = checkedInOrderIds.has(order.id);
                return (
                  <tr key={order.id} className="border-b border-zinc-100 dark:border-white/5">
                    <td className="px-3 py-2">
                      <p className="font-semibold">{order.buyerName}</p>
                      <p className="text-[10px] text-muted">{order.buyerPhone}</p>
                      {order.buyerEmail ? (
                        <p className="text-[10px] text-muted">{order.buyerEmail}</p>
                      ) : null}
                    </td>
                    <td className="hidden px-3 py-2 text-muted sm:table-cell">{order.tierName}</td>
                    <td className="px-3 py-2 font-semibold">{order.quantity}</td>
                    <td className="hidden px-3 py-2 sm:table-cell">
                      {order.totalPaise > 0 ? formatPaise(order.totalPaise) : "Free"}
                    </td>
                    <td className="px-3 py-2">
                      {isCheckedIn ? (
                        <Badge tone="success">Checked In</Badge>
                      ) : order.status === "CONFIRMED" ? (
                        <Badge tone="success">Confirmed</Badge>
                      ) : order.status === "REJECTED" ? (
                        <Badge tone="danger">Rejected</Badge>
                      ) : (
                        <Badge tone="violet">Pending</Badge>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 font-mono text-[10px] text-muted md:table-cell">
                      {order.utrReference || "—"}
                    </td>
                    <td className="hidden px-3 py-2 text-[10px] text-muted md:table-cell">
                      {formatDateTime(order.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
