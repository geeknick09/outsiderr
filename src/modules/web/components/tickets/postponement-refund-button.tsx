"use client";

import { useState } from "react";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";

import { declineRefundOfferAction, requestPostponementRefundAction } from "@/modules/web/actions/orders";
import { Button } from "@/modules/shared";

/**
 * Refund-or-keep panel for consumer-impacting event changes — postponement,
 * date change, or a move to a different city. Rides on order.refund_offered:
 * the event stays live either way; "Keep my ticket" clears the offer.
 */
export function PostponementRefundButton({
  orderId,
  eventId,
  eventTitle,
  reason,
}: {
  orderId: string;
  eventId: string;
  eventTitle: string;
  reason: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleRefund() {
    if (!confirm("Are you sure you want a refund? Your ticket will be cancelled.")) return;
    setLoading(true);
    const res = await requestPostponementRefundAction(eventId);
    setResult(res);
    setLoading(false);
  }

  async function handleKeep() {
    setLoading(true);
    await declineRefundOfferAction(orderId);
    setDismissed(true);
    setLoading(false);
  }

  if (result?.success) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <p className="font-bold text-emerald-600 dark:text-emerald-300">Refund requested</p>
        <p className="mt-1 text-muted">
          Your refund for <strong>{eventTitle}</strong> has been submitted. You will receive
          the amount in your original payment method within 5-7 business days.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
        <div>
          <p className="font-bold text-amber-600 dark:text-amber-300">Event changed</p>
          <p className="mt-1 text-sm text-muted">
            {reason ?? `The details for ${eventTitle} were updated.`} You can keep your ticket
            or request a full refund.
          </p>
        </div>
      </div>

      {result?.error ? (
        <p className="text-sm text-red-500">{result.error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          size="sm"
          onClick={handleRefund}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Request refund
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleKeep}
          disabled={loading}
        >
          Keep my ticket
        </Button>
      </div>
    </div>
  );
}
