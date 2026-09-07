import { Badge } from "@/components/ui/badge";
import { listAllAdminOrders } from "@/lib/data/admin";
import { formatDateTime, formatPaise } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Transactions — Outsiderr" };

const TONE: Record<OrderStatus, "warning" | "success" | "danger" | "neutral" | "violet"> = {
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

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "RESERVED", label: "Reserved" },
  { key: "FAILED", label: "Failed" },
  { key: "EXPIRED", label: "Expired" },
  { key: "REFUNDED", label: "Refunded" },
  { key: "REFUND_REQUESTED", label: "Refund Requested" },
  { key: "PENDING_VERIFICATION", label: "Legacy Pending" },
];

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const all = await listAllAdminOrders();

  const filtered =
    status && status !== "all"
      ? all.filter((o) => o.status === status)
      : all;

  // Summary counts
  const confirmed = all.filter((o) => o.status === "CONFIRMED");
  const reserved = all.filter((o) => o.status === "RESERVED");
  const failed = all.filter((o) => o.status === "FAILED");
  const refunded = all.filter((o) => o.status === "REFUNDED");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Transactions</h1>
        <p className="text-sm text-muted">
          Read-only payment history. All payments are processed via Razorpay.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted">Confirmed</p>
          <p className="text-2xl font-black">{confirmed.length}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted">Reserved (pending payment)</p>
          <p className="text-2xl font-black">{reserved.length}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted">Failed</p>
          <p className="text-2xl font-black">{failed.length}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted">Refunded</p>
          <p className="text-2xl font-black">{refunded.length}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <a
            key={tab.key}
            href={`/admin/orders?status=${tab.key}`}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              (status ?? "all") === tab.key
                ? "border-violet-neon bg-violet-neon/10 text-violet-neon"
                : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Transactions list */}
      <div className="space-y-2">
        {filtered.map((order) => (
          <div key={order.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{order.eventTitle}</p>
              <p className="text-xs text-muted">
                {order.buyerName ?? "—"} · {order.tierName} × {order.quantity} · {formatPaise(order.totalPaise)}
              </p>
              <p className="text-xs text-muted">
                {order.razorpayPaymentId
                  ? `Razorpay: ${order.razorpayPaymentId.slice(0, 24)}`
                  : order.utrReference
                    ? `Legacy UTR: ${order.utrReference}`
                    : "No payment reference"}
                {order.paymentMethod ? ` · ${order.paymentMethod}` : ""}
                {order.invoiceNumber ? ` · Invoice: ${order.invoiceNumber}` : ""}
              </p>
              <p className="text-xs text-zinc-400">{formatDateTime(order.createdAt)}</p>
              {order.rejectionReason ? (
                <p className="text-xs text-red-500">{order.rejectionReason}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={TONE[order.status]}>{order.status.replace("_", " ").toLowerCase()}</Badge>
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No transactions found.</p>
        ) : null}
      </div>
    </div>
  );
}
