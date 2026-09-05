import { adminApproveOrderAction, adminRejectOrderAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { BulkApprovePanel } from "@/components/admin/bulk-approve-panel";
import { ActionButton } from "@/components/ui/submit-button";
import { listAllAdminOrders } from "@/lib/data/admin";
import { formatDateTime, formatPaise } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Orders — Outsiderr" };

const TONE: Record<OrderStatus, "warning" | "success" | "danger" | "neutral"> = {
  PENDING_VERIFICATION: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

export default async function AdminOrdersPage({
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

  const pending = all.filter((o) => o.status === "PENDING_VERIFICATION");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Orders</h1>
          <p className="text-sm text-muted">{filtered.length} shown · {pending.length} pending</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {["all", "PENDING_VERIFICATION", "CONFIRMED", "REJECTED"].map((s) => (
          <a
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              (status ?? "all") === s
                ? "border-violet-neon bg-violet-neon/10 text-violet-neon"
                : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10"
            }`}
          >
            {s === "all" ? "All" : s === "PENDING_VERIFICATION" ? "Pending" : s === "CONFIRMED" ? "Confirmed" : "Rejected"}
          </a>
        ))}
      </div>

      {/* Bulk approve for pending */}
      {pending.length > 0 ? (
        <BulkApprovePanel pendingOrders={pending} />
      ) : null}

      {/* Orders list */}
      <div className="space-y-2">
        {filtered.map((order) => (
          <div key={order.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{order.eventTitle}</p>
              <p className="text-xs text-muted">
                {order.buyerName ?? "—"} · {order.tierName} × {order.quantity} · {formatPaise(order.totalPaise)}
              </p>
              <p className="text-xs text-muted">UTR: {order.utrReference ?? "—"}</p>
              <p className="text-xs text-zinc-400">{formatDateTime(order.createdAt)}</p>
              {order.rejectionReason ? (
                <p className="text-xs text-red-500">{order.rejectionReason}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[order.status]}>{order.status.replace("_", " ")}</Badge>
              {order.status === "PENDING_VERIFICATION" ? (
                <>
                  <form>
                    <ActionButton
                      formAction={async () => {
                        "use server";
                        await adminApproveOrderAction(order.id);
                      }}
                      loadingText="…"
                      className="border-zinc-200 text-muted hover:border-lime-400 hover:text-lime-600 dark:border-white/10"
                    >
                      Approve
                    </ActionButton>
                  </form>
                  <form className="flex gap-2">
                    <input
                      name="reason"
                      placeholder="Reason (optional)"
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5"
                    />
                    <ActionButton
                      formAction={async (fd) => {
                        "use server";
                        await adminRejectOrderAction(order.id, fd.get("reason") as string ?? "");
                      }}
                      loadingText="…"
                      className="border-zinc-200 text-muted hover:border-red-400 hover:text-red-500 dark:border-white/10"
                    >
                      Reject
                    </ActionButton>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No orders found.</p>
        ) : null}
      </div>
    </div>
  );
}
