"use client";

import { useState } from "react";
import Image from "next/image";

import { approveOrderAction, rejectOrderAction } from "@/actions/orders";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { formatPaise } from "@/lib/format";
import type { Order } from "@/lib/types";

export function VerificationQueue({ orders }: { orders: Order[] }) {
  const [proofOrder, setProofOrder] = useState<Order | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null);
  const [reason, setReason] = useState("");

  if (orders.length === 0) {
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
            {orders.map((order) => (
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
                      onClick={() => setProofOrder(order)}
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
                      onClick={() => {
                        setRejectingOrder(order);
                        setReason("");
                      }}
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
        onClose={() => setRejectingOrder(null)}
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
              onClick={() => setRejectingOrder(null)}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-muted hover:border-violet-neon dark:border-white/10"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={proofOrder !== null}
        onClose={() => setProofOrder(null)}
        title={`Payment proof — ${proofOrder?.buyerName ?? ""}`}
      >
        {proofOrder?.paymentProofUrl ? (
          <Image
            src={proofOrder.paymentProofUrl}
            alt="Payment screenshot"
            width={800}
            height={1000}
            unoptimized
            className="w-full rounded-2xl"
          />
        ) : null}
        <p className="mt-3 font-mono text-xs text-muted">
          UTR {proofOrder?.utrReference ?? "—"}
        </p>
      </Modal>
    </>
  );
}
