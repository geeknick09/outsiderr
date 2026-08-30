"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { adminApproveOrderAction } from "@/actions/admin";
import type { Order } from "@/lib/types";

export function BulkApprovePanel({ pendingOrders }: { pendingOrders: Order[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(pendingOrders.map((o) => o.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleBulkApprove() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      for (const id of ids) {
        try {
          await adminApproveOrderAction(id);
          setDone((prev) => new Set([...prev, id]));
        } catch {
          setFailed((prev) => new Set([...prev, id]));
        }
      }
      setSelected(new Set());
    });
  }

  const eligible = pendingOrders.filter((o) => !done.has(o.id));

  if (eligible.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        All pending orders approved.
      </div>
    );
  }

  return (
    <div className="glass space-y-3 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Bulk approve ({eligible.length} pending)</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-violet-neon hover:underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-muted hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {eligible.map((order) => (
          <label key={order.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 hover:border-violet-neon/50 dark:border-white/10">
            <input
              type="checkbox"
              checked={selected.has(order.id)}
              onChange={() => toggle(order.id)}
              className="h-4 w-4 accent-violet-500"
            />
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{order.eventTitle}</span>
              <span className="ml-2 text-muted">{order.buyerName ?? "—"} · UTR {order.utrReference ?? "—"}</span>
            </div>
            {failed.has(order.id) ? (
              <span className="text-xs text-red-500">Failed</span>
            ) : null}
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={selected.size === 0 || pending}
        onClick={handleBulkApprove}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neon-gradient py-2.5 text-sm font-bold text-white shadow-glow-violet transition-opacity disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Approving…
          </>
        ) : (
          `Approve ${selected.size > 0 ? selected.size : ""} selected`
        )}
      </button>
    </div>
  );
}
