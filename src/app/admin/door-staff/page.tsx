import { Badge } from "@/components/ui/badge";
import { listAllDoorStaffOrders } from "@/lib/data/door-staff";
import { formatPaise } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Door Staff — Outsiderr" };

const PAYMENT_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  PAID: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

const SERVICE_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  REQUESTED: "warning",
  CONFIRMED: "success",
  CANCELLED: "danger",
  COMPLETED: "neutral",
};

export default async function AdminDoorStaffPage() {
  const orders = await listAllDoorStaffOrders();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight">Door Staff Orders</h1>

      {orders.length === 0 ? (
        <p className="glass rounded-3xl p-5 text-sm text-muted">
          No door staff orders yet.
        </p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {order.numberOfStaff} staff • {formatPaise(order.serviceAmountPaise)}
                  </p>
                  <p className="text-xs text-muted">
                    Event: {order.eventTitle ?? order.eventId.slice(0, 8)} •{" "}
                    {new Date(order.createdAt).toLocaleDateString("en-IN")}
                  </p>
                  {order.utrReference ? (
                    <p className="mt-1 font-mono text-xs text-muted">
                      UTR: {order.utrReference}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={PAYMENT_TONE[order.paymentStatus] ?? "neutral"}>
                    {order.paymentStatus}
                  </Badge>
                  <Badge tone={SERVICE_TONE[order.serviceStatus] ?? "neutral"}>
                    {order.serviceStatus}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
