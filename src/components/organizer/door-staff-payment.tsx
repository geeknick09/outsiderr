"use client";

import { useState } from "react";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";

import { verifyDoorStaffPaymentAction } from "@/actions/door-staff";
import { QrCode } from "@/components/ui/qr-code";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/format";
import { upiIntent } from "@/lib/upi";
import type { DoorStaffOrder } from "@/lib/types";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function DoorStaffPaymentPanel({
  order,
  platformUpiId,
}: {
  order: DoorStaffOrder;
  platformUpiId: string;
}) {
  const [utr, setUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (order.paymentStatus === "PAID" || done) {
    return (
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500/10">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="font-bold text-green-500">Door staff payment confirmed</p>
            <p className="text-xs text-muted">
              {order.numberOfStaff} staff • {formatPaise(order.serviceAmountPaise)} paid
              {order.utrReference ? ` • UTR: ${order.utrReference}` : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const upiString = upiIntent({
    upiId: platformUpiId,
    payeeName: "Outsiderr Door Staff",
    amountPaise: order.serviceAmountPaise,
    note: `Door staff ${order.numberOfStaff}x — ${order.eventId.slice(0, 8)}`,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await verifyDoorStaffPaymentAction(order.id, utr);
    if (result.error) {
      setError(result.error);
    } else {
      setDone(true);
    }
    setSubmitting(false);
  }

  return (
    <div className="glass space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-neon/10">
          <ShieldCheck className="h-5 w-5 text-violet-neon" />
        </div>
        <div className="flex-1">
          <p className="font-bold">Door staff payment pending</p>
          <p className="text-xs text-muted">
            {order.numberOfStaff} staff • {formatPaise(order.serviceAmountPaise)}
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* QR code */}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
          <QrCode value={upiString} size={180} />
          <p className="text-center text-xs text-muted">
            Scan with any UPI app to pay {formatPaise(order.serviceAmountPaise)}
          </p>
          <p className="font-mono text-xs text-muted">{platformUpiId}</p>
        </div>

        {/* UTR submission */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">After payment, submit UTR reference</p>
          <p className="text-xs text-muted">
            Find the UTR/reference number in your UPI app&apos;s payment confirmation or bank statement.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="e.g. 456789012345"
              className={INPUT}
              required
              disabled={submitting}
            />
            {error ? <p className="text-xs text-red-500">{error}</p> : null}
            <Button type="submit" size="sm" disabled={submitting || !utr.trim()} loading={submitting} loadingText="Verifying…">
              Submit UTR
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
