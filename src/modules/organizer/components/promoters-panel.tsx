"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Megaphone, UserX } from "lucide-react";

import { Badge, formatPaise } from "@/modules/shared";
import { removeEventPromoterAction } from "../actions/promoters";

export type EventPromoterRow = {
  promoterId: string;
  name: string;
  via: "LINK" | "PROMO_CODE";
  handle: string;
  clicks: number;
  sales: number;
  earnedPaise: number;
  active: boolean;
};

/** Event-level promoter list — clicks/sales per promoter, with remove. */
export function PromotersPanel({
  eventId,
  promoters,
}: {
  eventId: string;
  promoters: EventPromoterRow[];
}) {
  const [rows, setRows] = useOptimistic(promoters);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (promoters.length === 0) {
    return (
      <p className="text-sm text-muted">
        No promoters yet — share the event link; anyone who taps &quot;Promote this event&quot; shows up here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs text-muted">
        <Megaphone className="h-3.5 w-3.5" /> Promoter commission comes out of your payout — never the buyer.
      </p>
      {rows.map((p) => (
        <div key={`${p.via}-${p.handle}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{p.name}</p>
            <p className="text-xs text-muted">
              <code>{p.handle}</code>
              {p.via === "LINK" ? ` · ${p.clicks} clicks` : ""}
              {" · "}{p.sales} sales · {formatPaise(p.earnedPaise)} earned
            </p>
          </div>
          <Badge tone={p.active ? "success" : "danger"}>{p.active ? "Active" : "Removed"}</Badge>
          {p.active ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setRows((prev) => prev.map((x) => x === p ? { ...x, active: false } : x));
                  const res = await removeEventPromoterAction(eventId, p.promoterId);
                  if (res.error) setError(res.error);
                })
              }
              className="rounded-full border border-zinc-200 p-2 text-muted hover:border-red-400 hover:text-red-500 disabled:opacity-40 dark:border-white/10"
              title="Remove promoter (keeps earned commission, stops new sales)"
              aria-label="Remove promoter"
            >
              <UserX className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
