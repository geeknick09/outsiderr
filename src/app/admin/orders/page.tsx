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
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status, page } = await searchParams;
  const all = await listAllAdminOrders();

  const filtered =
    status && status !== "all"
      ? all.filter((o) => o.status === status)
      : all;

  const pageNumber = Math.max(1, Number(page ?? 1) || 1);
  const pageSize = 10;
  const pageRows = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

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
          Read-only payment history. Paid events use manual UPI with organizer verification.
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
      <div className="glass space-y-2 rounded-3xl p-3">
        {pageRows.map((order) => (
          <div key={order.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200/80 p-4 dark:border-white/10">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{order.eventTitle}</p>
              <p className="text-xs text-muted">
                {order.buyerName ?? "—"} · {order.tierName} × {order.quantity} · {formatPaise(order.totalPaise)}
              </p>
              <p className="text-xs text-muted">
                {order.razorpayPaymentId
                  ? `Razorpay: ${order.razorpayPaymentId.slice(0, 24)}`
                  : order.utrReference
                    ? `UTR: ${order.utrReference}`
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
              {order.orderSource && order.orderSource !== "ONLINE" ? (
                <Badge tone="warning">{order.isBoxOffice ? "Box Office" : "Manual"}</Badge>
              ) : null}
              <Badge tone={TONE[order.status]}>{order.status.replace("_", " ").toLowerCase()}</Badge>
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-200 p-5 text-sm text-muted dark:border-white/10">No transactions found.</p>
        ) : null}
      </div>

      {filtered.length > pageSize ? (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-zinc-200 bg-white/50 p-3 text-xs dark:border-white/10 dark:bg-white/5">
          <a
            href={buildPageHref(status, pageNumber - 1)}
            className={`rounded-full border px-3 py-1.5 font-semibold ${pageNumber <= 1 ? "pointer-events-none opacity-50" : "border-zinc-200 text-muted hover:border-violet-neon dark:border-white/10"}`}
          >
            Previous
          </a>
          <span className="text-muted">Page {pageNumber} of {totalPages}</span>
          <a
            href={buildPageHref(status, pageNumber + 1)}
            className={`rounded-full border px-3 py-1.5 font-semibold ${pageNumber >= totalPages ? "pointer-events-none opacity-50" : "border-zinc-200 text-muted hover:border-violet-neon dark:border-white/10"}`}
          >
            Next
          </a>
        </div>
      ) : null}
    </div>
  );
}

function buildPageHref(status: string | undefined, page: number) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  return `/admin/orders${params.toString() ? `?${params.toString()}` : ""}`;
}
