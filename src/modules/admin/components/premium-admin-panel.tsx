"use client";

import { useState, useTransition } from "react";
import { Crown } from "lucide-react";

import { adminGrantPremiumAction, adminRevokePremiumAction } from "@/modules/admin/actions/admin";
import { formatDateTime } from "@/modules/shared";

interface AuditRow {
  adminEmail: string | null;
  action: string;
  reason: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export function PremiumAdminPanel({
  organizerId,
  isPremium,
  premiumUntil,
  audit,
}: {
  organizerId: string;
  isPremium: boolean;
  premiumUntil: string | null;
  audit: AuditRow[];
}) {
  const [months, setMonths] = useState<3 | 6 | 12>(3);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (fn: () => Promise<{ error: string | null }>) => {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.error) setErr(res.error);
      else setReason("");
    });
  };

  return (
    <div className="glass rounded-3xl p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Crown className="h-4 w-4 text-amber-400" />
        Premium access
      </h2>

      <p className="mb-3 text-sm">
        Status:{" "}
        {isPremium ? (
          <span className="font-semibold text-amber-400">
            Premium until {premiumUntil ? formatDateTime(premiumUntil) : "?"}
          </span>
        ) : (
          <span className="text-muted">Not premium</span>
        )}
      </p>

      <div className="space-y-2">
        <div className="flex gap-2">
          {([3, 6, 12] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold ${
                months === m
                  ? "bg-amber-400 text-zinc-900"
                  : "border border-zinc-200 text-muted hover:border-amber-400/60 dark:border-white/10"
              }`}
            >
              {m} months
            </button>
          ))}
        </div>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required, saved to audit log)"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 dark:border-white/10 dark:bg-white/5"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => submit(() => adminGrantPremiumAction(organizerId, months, reason))}
            className="rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-zinc-900 transition-all hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Grant premium"}
          </button>
          {isPremium ? (
            <button
              type="button"
              disabled={pending || !reason.trim()}
              onClick={() => submit(() => adminRevokePremiumAction(organizerId, reason))}
              className="rounded-full border border-red-400/50 px-5 py-2 text-xs font-bold text-red-500 transition-all hover:bg-red-500/10 disabled:opacity-40"
            >
              Revoke now
            </button>
          ) : null}
        </div>
        {err ? <p className="text-xs text-red-500">{err}</p> : null}
      </div>

      {audit.length > 0 ? (
        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-white/10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Premium audit log
          </p>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {audit.map((a, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-white/10">
                <p className="font-semibold">
                  {a.action}{" "}
                  <span className="text-muted">
                    by {a.adminEmail ?? "admin"} · {formatDateTime(a.createdAt)}
                  </span>
                </p>
                {a.reason ? <p className="mt-0.5 text-muted">{a.reason}</p> : null}
                <p className="mt-0.5 font-mono text-[10px] text-muted">
                  {a.oldValue ?? "null"} → {a.newValue ?? "null"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
