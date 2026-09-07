"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { approveOrderAction, rejectOrderAction } from "@/actions/orders";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { formatPaise } from "@/lib/format";
import type { Order } from "@/lib/types";

export function VerificationQueue({
  orders,
  organizerEventIds,
}: {
  orders: Order[];
  organizerEventIds: string[];
}) {
  const router = useRouter();
  const [orderList, setOrderList] = useState<Order[]>(orders);
  const [proofOrder, setProofOrder] = useState<Order | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null);
  const [reason, setReason] = useState("");

  // One consolidated channel with event_id filter instead of two unfiltered channels.
  // This prevents receiving ALL global order changes and filtering client-side.
  const realtimeFilter = useMemo(
    () =>
      organizerEventIds.length > 0
        ? `event_id=in.(${organizerEventIds.join(",")})`
        : undefined,
    [organizerEventIds],
  );

  useRealtime({
    channelName: `vq-orders:${organizerEventIds.join("-")}`,
    table: "orders",
    event: "*",
    filter: realtimeFilter,
    enabled: organizerEventIds.length > 0,
    onPayload: ({ eventType, new: row }) => {
      if (eventType === "INSERT") {
        if (row.status === "PENDING_VERIFICATION") {
          // New pending order — refresh to get full joined data
          router.refresh();
        }
      } else if (eventType === "UPDATE") {
        if (row.status !== "PENDING_VERIFICATION") {
          // Order approved or rejected — remove from queue
          setOrderList((prev) => prev.filter((o) => o.id !== row.id));
        }
      }
    },
  });

  const handleProofOpen = useCallback((order: Order) => setProofOrder(order), []);
  const handleProofClose = useCallback(() => setProofOrder(null), []);
  const handleRejectOpen = useCallback((order: Order) => {
    setRejectingOrder(order);
    setReason("");
  }, []);
  const handleRejectClose = useCallback(() => setRejectingOrder(null), []);

  if (orderList.length === 0) {
    return (
      <p className="glass rounded-3xl p-5 text-sm text-muted">
        No payments waiting for verification.
      </p>
    );
  }

  return (
    <>
      <div className="glass overflow-x-auto rounded-3xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-zinc-200 dark:border-white/10">
              <th className="p-4">Attendee</th>
              <th className="p-4">Event</th>
              <th className="p-4">UTR</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Proof</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {orderList.map((order) => (
              <tr
                key={order.id}
                className="border-b border-zinc-100 last:border-0 dark:border-white/5"
              >
                <td className="p-4">
                  <span className="block font-semibold">{order.buyerName ?? "—"}</span>
                  <span className="text-xs text-muted">{order.buyerPhone ?? "—"}</span>
                </td>
                <td className="p-4">
                  <span className="block">{order.eventTitle}</span>
                  <span className="text-xs text-muted">
                    {order.tierName} × {order.quantity}
                  </span>
                </td>
                <td className="p-4 font-mono text-xs">{order.utrReference ?? "—"}</td>
                <td className="p-4">{formatPaise(order.totalPaise)}</td>
                <td className="p-4">
                  {order.paymentProofUrl ? (
                    <button
                      type="button"
                      onClick={() => handleProofOpen(order)}
                      className="text-violet-neon underline"
                    >
                      View
                    </button>
                  ) : (
                    <Badge tone="warning">None</Badge>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <form action={approveOrderAction}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <SubmitButton size="sm" loadingText="Approving…">
                        Approve
                      </SubmitButton>
                    </form>
                    <button
                      type="button"
                      onClick={() => handleRejectOpen(order)}
                      className="rounded-xl bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-500/20"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rejection reason modal */}
      <Modal
        open={rejectingOrder !== null}
        onClose={handleRejectClose}
        title={`Reject order — ${rejectingOrder?.buyerName ?? ""}`}
      >
        <form action={rejectOrderAction} className="space-y-4">
          <input type="hidden" name="orderId" value={rejectingOrder?.id ?? ""} />
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Rejection reason
            </label>
            <textarea
              name="reason"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. UTR does not match our records. Please re-submit with the correct transaction reference."
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <p className="mt-1 text-xs text-muted">
              This reason will be visible to the attendee on their ticket page.
            </p>
          </div>
          <div className="flex gap-2">
            <SubmitButton variant="danger" loadingText="Rejecting…">
              Confirm rejection
            </SubmitButton>
            <button
              type="button"
              onClick={handleRejectClose}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-muted hover:border-violet-neon dark:border-white/10"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={proofOrder !== null}
        onClose={handleProofClose}
        title={`Payment proof — ${proofOrder?.buyerName ?? ""}`}
      >
        {proofOrder?.paymentProofUrl ? (
          <Image
            src={proofOrder.paymentProofUrl}
            alt="Payment screenshot"
            width={400}
            height={500}
            unoptimized
            className="w-full rounded-2xl"
            sizes="(max-width: 640px) 100vw, 512px"
          />
        ) : null}
        <p className="mt-3 font-mono text-xs text-muted">
          UTR {proofOrder?.utrReference ?? "—"}
        </p>
      </Modal>
    </>
  );
}
