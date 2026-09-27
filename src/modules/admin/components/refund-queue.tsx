"use client";

import { useState, useTransition } from "react";

import {
  adminApproveRefundAction,
  adminManualSettleAction,
  adminProcessRefundsNowAction,
  adminRejectRefundAction,
} from "../actions/refunds";
import { Button } from "@/modules/shared";

/** Approve/reject/settle controls for a single refund row. */
export function RefundRowActions({ refundId, status }: { refundId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (status !== "REQUESTED" && status !== "FAILED" && status !== "INITIATING" && status !== "INITIATED") {
    return null;
  }

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.error) setError(result.error);
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === "REQUESTED" ? (
          <>
            <Button size="sm" disabled={pending} loading={pending}
              onClick={() => run(() => adminApproveRefundAction(refundId, "TICKET_PRICE"))}>
              Approve (ticket)
            </Button>
            <Button size="sm" variant="secondary" disabled={pending}
              onClick={() => run(() => adminApproveRefundAction(refundId, "FULL"))}>
              Approve full
            </Button>
            <Button size="sm" variant="secondary" disabled={pending}
              onClick={() => {
                const reason = window.prompt("Rejection reason (shown to the buyer):") ?? "";
                if (!reason.trim()) return;
                run(() => adminRejectRefundAction(refundId, reason.trim()));
              }}>
              Reject
            </Button>
          </>
        ) : null}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Settlement ref (optional)"
          className="w-40 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5"
        />
        <Button size="sm" variant="secondary" disabled={pending || !note.trim()}
          onClick={() => run(() => adminManualSettleAction(refundId, note.trim()))}>
          Mark settled
        </Button>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

/** "Run worker now" button for the header. */
export function ProcessRefundsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {message ? <span className="text-xs text-muted">{message}</span> : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        loading={pending}
        loadingText="Running…"
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await adminProcessRefundsNowAction();
            setMessage(
              result.error
                ? result.error
                : `Processed ${result.claimed ?? 0} (initiated ${result.initiated ?? 0}, failed ${result.failed ?? 0}, skipped ${result.skipped ?? 0})`,
            );
          })
        }
      >
        Run refund worker now
      </Button>
    </div>
  );
}