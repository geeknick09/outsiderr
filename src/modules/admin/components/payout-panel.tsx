"use client";

import { useState, useTransition } from "react";

import { adminCreatePayoutAction, adminUpdatePayoutStatusAction } from "../actions/payouts";
import { Button } from "@/modules/shared";

const INPUT =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

const METHODS = ["UPI", "NEFT", "IMPS", "RTGS", "CASH", "OTHER"] as const;

/** Schedule a payout for an organizer (PENDING - send money manually after). */
export function CreatePayoutForm({
  organizerId,
  organizerName,
  owedPaise,
}: {
  organizerId: string;
  organizerName: string;
  owedPaise: number;
}) {
  const [amount, setAmount] = useState(String(owedPaise / 100));
  const [method, setMethod] = useState<(typeof METHODS)[number]>("NEFT");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setMsg(null);
          const paise = Math.round(parseFloat(amount) * 100);
          const result = await adminCreatePayoutAction(organizerId, paise, method, null, note || undefined);
          setMsg(result.error ?? `Payout scheduled - ₹${(paise / 100).toFixed(2)}`);
        });
      }}
    >
      <input
        type="number" min="1" step="0.01" value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={`${INPUT} w-28`} placeholder="₹ amount"
      />
      <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={`${INPUT} w-24`}>
        {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} className={`${INPUT} w-44`} placeholder="Note (optional)" />
      <Button type="submit" size="sm" disabled={pending || !amount} loading={pending} loadingText="Creating…">
        Schedule payout
      </Button>
      {msg ? <p className={`w-full text-xs ${msg.startsWith("Payout") ? "text-emerald-600" : "text-red-500"}`}>{msg}</p> : null}
      <span className="sr-only">{organizerName}</span>
    </form>
  );
}

/** Per-row status transition buttons for a payout record. */
export function PayoutRowActions({ payoutId, status }: { payoutId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "COMPLETED" || status === "FAILED") return null;

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "PENDING" ? (
          <Button size="sm" variant="secondary" disabled={pending}
            onClick={() => run(() => adminUpdatePayoutStatusAction(payoutId, "PROCESSING"))}>
            Processing
          </Button>
        ) : null}
        <Button size="sm" disabled={pending}
          onClick={() => {
            const ref = window.prompt("Bank/UTR reference for this transfer:") ?? "";
            if (!ref.trim()) return;
            run(() => adminUpdatePayoutStatusAction(payoutId, "COMPLETED", { bankReference: ref.trim() }));
          }}>
          Mark completed
        </Button>
        <Button size="sm" variant="danger" disabled={pending}
          onClick={() => {
            const reason = window.prompt("Why did this payout fail?") ?? "";
            if (!reason.trim()) return;
            run(() => adminUpdatePayoutStatusAction(payoutId, "FAILED", { failureReason: reason.trim() }));
          }}>
          Failed
        </Button>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
