import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin: Payments — Outsiderr" };

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function AdminPaymentsPage() {
  let recentWebhooks: Array<{
    id: string;
    razorpay_event_id: string;
    event_type: string;
    processed: boolean;
    error_message: string | null;
    created_at: string;
    order_id: string | null;
  }> = [];
  let failedWebhooks: typeof recentWebhooks = [];
  let staleReservations: Array<{
    id: string;
    event_id: string;
    buyer_name: string | null;
    total_paise: number;
    reservation_expires_at: string | null;
  }> = [];

  try {
    const supabase = createServiceClient();

    // Recent webhook events
    const { data: webhookData } = await supabase
      .from("webhook_events")
      .select("id, razorpay_event_id, event_type, processed, error_message, created_at, order_id")
      .order("created_at", { ascending: false })
      .limit(100);

    recentWebhooks = webhookData ?? [];
    failedWebhooks = recentWebhooks.filter((w) => !w.processed);

    // Stale RESERVED orders (older than 15 min — should have been expired by cron)
    const { data: staleData } = await supabase
      .from("orders")
      .select("id, event_id, buyer_name, total_paise, reservation_expires_at")
      .eq("status", "RESERVED")
      .lt("reservation_expires_at", new Date().toISOString())
      .order("reservation_expires_at", { ascending: true });

    staleReservations = staleData ?? [];
  } catch (err) {
    // Service client may not be configured in dev — show empty state
    console.error("Admin payments page error:", err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Payment Reconciliation</h1>
        <p className="text-sm text-muted">
          Monitor webhook health and payment reconciliation status.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-3xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total Webhooks</p>
          <p className="mt-1 text-2xl font-black">{recentWebhooks.length}</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Failed / Unprocessed</p>
          <p className="mt-1 text-2xl font-black text-red-500">{failedWebhooks.length}</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Stale Reservations</p>
          <p className="mt-1 text-2xl font-black text-amber-500">{staleReservations.length}</p>
        </div>
      </div>

      {/* Stale reservations */}
      {staleReservations.length > 0 ? (
        <div className="glass rounded-3xl p-5">
          <h2 className="mb-3 text-base font-bold text-amber-600">
            Stale Reservations (older than 15 min)
          </h2>
          <p className="mb-3 text-xs text-muted">
            These RESERVED orders should have been expired by the cron job. Run the cron endpoint
            or wait for the next scheduled run.
          </p>
          <div className="space-y-2">
            {staleReservations.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                <div>
                  <p className="font-semibold">{r.buyer_name ?? "Unknown"}</p>
                  <p className="text-xs text-muted">Expires: {r.reservation_expires_at ? formatDateTime(r.reservation_expires_at) : "—"}</p>
                </div>
                <p className="font-bold">{formatPaise(r.total_paise)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Failed webhooks */}
      {failedWebhooks.length > 0 ? (
        <div className="glass rounded-3xl p-5">
          <h2 className="mb-3 text-base font-bold text-red-500">Failed Webhook Events</h2>
          <div className="space-y-2">
            {failedWebhooks.map((w) => (
              <div key={w.id} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-500/10">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{w.razorpay_event_id}</span>
                  <Badge tone="danger">{w.event_type}</Badge>
                </div>
                <p className="mt-1 text-xs text-red-600">{w.error_message ?? "Unknown error"}</p>
                <p className="mt-1 text-xs text-muted">{formatDateTime(w.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Recent webhooks */}
      <div className="glass rounded-3xl p-5">
        <h2 className="mb-3 text-base font-bold">Recent Webhook Events</h2>
        {recentWebhooks.length === 0 ? (
          <p className="text-sm text-muted">No webhook events received yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 dark:border-white/10">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Event ID</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Type</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Status</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase text-muted">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                {recentWebhooks.slice(0, 20).map((w) => (
                  <tr key={w.id}>
                    <td className="p-3 font-mono text-xs">{w.razorpay_event_id.slice(0, 24)}…</td>
                    <td className="p-3 text-xs">{w.event_type}</td>
                    <td className="p-3">
                      <Badge tone={w.processed ? "success" : "danger"}>
                        {w.processed ? "Processed" : "Failed"}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted">{formatDateTime(w.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
