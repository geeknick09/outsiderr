"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";

import { Badge, Button, formatDateTime, formatPaise } from "@/modules/shared";
import { savePayoutDetailsAction, type PromoterState } from "@/modules/web/actions/promoter";
import type { PromoterDashboard } from "@/modules/shared";

const INPUT =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";

export function PromoterDashboardView({ dashboard }: { dashboard: PromoterDashboard }) {
  const [state, formAction, pending] = useActionState<PromoterState, FormData>(
    savePayoutDetailsAction,
    { error: null },
  );
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const { balances } = dashboard;

  return (
    <div className="space-y-6">
      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Clicks / redemptions", value: `${balances.clicks} / ${balances.redemptions}` },
          { label: "Earned (net)", value: formatPaise(balances.earnedPaise) },
          { label: "Payable now", value: formatPaise(balances.payablePaise), accent: balances.payablePaise > 0 },
          { label: "Paid out", value: formatPaise(balances.paidPaise) },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</p>
            <p className={`mt-1 text-lg font-black ${s.accent ? "text-lime-500" : ""}`}>{s.value}</p>
          </div>
        ))}
      </div>
      {balances.clawedPaise > 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          −{formatPaise(balances.clawedPaise)} clawed back from refunded orders - it nets against future earnings.
        </p>
      ) : null}

      {/* Payout details */}
      <section className="glass rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Payout details</h2>
          {dashboard.hasPayoutDetails ? (
            <Badge tone="success">Saved</Badge>
          ) : (
            <Badge tone="warning">Required before payout</Badge>
          )}
        </div>
        {dashboard.hasPayoutDetails ? (
          <p className="text-xs text-muted">
            Bank {dashboard.masked.account} · IFSC {dashboard.masked.ifsc} · PAN {dashboard.masked.pan}
            {dashboard.masked.upi ? ` · UPI ${dashboard.masked.upi}` : ""}
            {" "}- submitted on your last save; edit below to update.
          </p>
        ) : null}
        <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input name="accountName" required placeholder="Account holder name" className={INPUT} />
          <input name="accountNumber" required placeholder="Account number" inputMode="numeric" className={INPUT} />
          <input name="ifsc" required placeholder="IFSC (e.g. HDFC0001234)" className={INPUT} />
          <input name="pan" required placeholder="PAN" className={INPUT} />
          <input name="upiId" placeholder="UPI id (optional)" className={`${INPUT} sm:col-span-2`} />
          {state.error ? <p className="text-xs text-red-500 sm:col-span-2">{state.error}</p> : null}
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending} loading={pending} loadingText="Saving…">
              Save payout details
            </Button>
          </div>
        </form>
      </section>

      {/* Programs */}
      <section className="glass rounded-3xl p-5">
        <h2 className="mb-3 text-sm font-bold">Your links &amp; codes</h2>
        {dashboard.programs.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet - open an event with a promoter program and hit &quot;Promote this event&quot;.
          </p>
        ) : (
          <div className="space-y-2">
            {dashboard.programs.map((p) => {
              const handle = p.mode === "LINK" ? `/p/${p.slug}` : p.code ?? "";
              const url = p.mode === "LINK"
                ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${p.slug}`
                : p.code ?? "";
              return (
                <div key={`${p.mode}-${handle}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
                  <div className="min-w-0 flex-1">
                    <Link href={`/events/${p.eventId}`} className="block truncate text-sm font-semibold hover:text-violet-neon">
                      {p.eventTitle}
                    </Link>
                    <p className="text-xs text-muted">
                      {p.mode === "LINK" ? `${p.clicks} clicks · ` : ""}
                      {formatPaise(p.salesPaise)} driven · {formatPaise(p.earnedPaise)} earned
                    </p>
                  </div>
                  <code className="rounded-lg bg-black/30 px-2.5 py-1 text-xs text-white">{handle}</code>
                  <button
                    type="button"
                    onClick={() => copy(url, handle)}
                    className="rounded-lg border border-zinc-200 p-1.5 text-muted hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
                    aria-label="Copy"
                  >
                    {copied === handle ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Earnings ledger */}
      <section className="glass rounded-3xl p-5">
        <h2 className="mb-3 text-sm font-bold">Earnings</h2>
        {dashboard.earnings.length === 0 ? (
          <p className="text-sm text-muted">No earnings yet.</p>
        ) : (
          <div className="space-y-1.5">
            {dashboard.earnings.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{e.eventTitle}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(e.createdAt)} · {e.via === "LINK" ? "Share link" : "Promo code"}
                    {e.kind === "CLAWBACK" ? " · refund reversal" : ""}
                  </p>
                </div>
                <span className={`ml-3 shrink-0 font-bold ${e.amountPaise < 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {formatPaise(e.amountPaise)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Payouts */}
      {dashboard.payouts.length > 0 ? (
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 text-sm font-bold">Payouts</h2>
          <div className="space-y-1.5">
            {dashboard.payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-muted">{formatDateTime(p.initiatedAt)}</span>
                <span className="font-bold">{formatPaise(p.amountPaise)}</span>
                <Badge tone={p.status === "COMPLETED" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>
                  {p.status}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
