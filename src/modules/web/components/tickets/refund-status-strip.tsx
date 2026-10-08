"use client";

import { Check, Clock, X } from "lucide-react";

import { cn, formatPaise } from "@/modules/shared";
import type { Refund } from "@/modules/shared/server";

const STEPS = ["Requested", "Approved", "Initiated", "Completed"] as const;

function stepIndex(status: Refund["status"]): number {
  switch (status) {
    case "REQUESTED":
      return 0;
    case "PENDING":
      return 1;
    case "INITIATING":
    case "INITIATED":
      return 2;
    case "COMPLETED":
    case "MANUAL_SETTLED":
      return 3;
    default:
      return -1;
  }
}

/** Compact timeline under an order - shows where its refund sits. */
export function RefundStatusStrip({ refund }: { refund: Refund }) {
  const terminal = refund.status === "REJECTED" || refund.status === "FAILED";
  const active = stepIndex(refund.status);
  const label =
    refund.status === "MANUAL_SETTLED"
      ? "Settled manually"
      : refund.status === "COMPLETED"
        ? "Refunded"
        : refund.status;

  return (
    <div className="mt-3 rounded-2xl border border-violet-200/60 bg-violet-50/60 px-4 py-3 dark:border-violet-500/20 dark:bg-violet-500/5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-violet-900 dark:text-violet-200">
          Refund {formatPaise(refund.amountPaise)}
          {refund.refundScope === "TICKET_PRICE" ? (
            <span className="ml-1 font-normal text-muted">(ticket price)</span>
          ) : null}
        </span>
        <span
          className={cn(
            "font-semibold",
            refund.status === "REJECTED"
              ? "text-red-600"
              : refund.status === "FAILED"
                ? "text-amber-600"
                : refund.status === "COMPLETED" || refund.status === "MANUAL_SETTLED"
                  ? "text-emerald-600"
                  : "text-violet-600",
          )}
        >
          {label}
        </span>
      </div>
      {!terminal ? (
        <ol className="mt-2 flex items-center gap-1">
          {STEPS.map((step, i) => (
            <li key={step} className="flex flex-1 items-center gap-1">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  i <= active
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-zinc-300 text-transparent dark:border-zinc-600",
                )}
              >
                {i < active ? (
                  <Check className="h-2.5 w-2.5" />
                ) : i === active ? (
                  <Clock className="h-2.5 w-2.5" />
                ) : (
                  "·"
                )}
              </span>
              <span
                className={cn(
                  "truncate text-[10px]",
                  i <= active ? "font-semibold" : "text-muted",
                )}
              >
                {step}
              </span>
              {i < STEPS.length - 1 ? (
                <span
                  className={cn(
                    "mx-1 h-px flex-1",
                    i < active ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600",
                  )}
                />
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
          <X className="h-3 w-3" />
          {refund.status === "REJECTED"
            ? (refund.rejectedReason ?? "Refund request was not approved.")
            : refund.lastError
              ? `Refund hit an error - our team will retry or settle it manually.`
              : "Refund hit an error - our team will retry or settle it manually."}
        </p>
      )}
    </div>
  );
}