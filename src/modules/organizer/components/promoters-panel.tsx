"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Megaphone, UserX } from "lucide-react";

import { Badge, formatPaise } from "@/modules/shared";
import { removeEventPromoterAction } from "../actions/promoters";
import { updateEventSectionAction, type UpdateEventSectionState } from "../actions/events";

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

/** Event-level promoter list - clicks/sales per promoter, with remove. */
export function PromotersPanel({
  eventId,
  promoters,
  program,
}: {
  eventId: string;
  promoters: EventPromoterRow[];
  /** Configured program - shown even before anyone signs up. */
  program?: { mode: string; commissionBps: number; promoBuyerBps?: number; promoPromoterBps?: number };
}) {
  const [rows, setRows] = useOptimistic(promoters);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progState, progAction, progPending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction, { error: null },
  );
  const mode = program?.mode ?? "NONE";

  const programSummary = program && program.mode !== "NONE" ? (
    <p className="rounded-2xl border border-violet-neon/30 bg-violet-neon/5 px-4 py-2.5 text-xs font-semibold text-violet-neon">
      {program.mode === "LINK"
        ? `Share-link program - promoters earn ${(program.commissionBps / 100).toFixed(1)}% of each sale.`
        : `Promo codes - buyers get ${((program.promoBuyerBps ?? 0) / 100).toFixed(1)}% off, promoters earn ${((program.promoPromoterBps ?? 0) / 100).toFixed(1)}%.`}
    </p>
  ) : null;

  // Turn the whole promoter program off/on for this event - keeps commission
  // values so re-enabling restores them.
  const programToggle = (
    <form action={progAction} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-2.5 dark:border-white/10">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="section" value="promoters" />
      <input type="hidden" name="promoterCommissionBps" value={String((program?.commissionBps ?? 1000) / 100)} />
      <input type="hidden" name="promoBuyerDiscountBps" value={String((program?.promoBuyerBps ?? 500) / 100)} />
      <input type="hidden" name="promoPromoterBps" value={String((program?.promoPromoterBps ?? 500) / 100)} />
      <span className="text-xs font-semibold text-muted">Promoter program:</span>
      <select name="promoterMode" defaultValue={mode} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold dark:border-white/10 dark:bg-ink dark:text-white">
        <option value="NONE">Off</option>
        <option value="LINK">Share-link</option>
        <option value="PROMO_CODE">Promo codes</option>
      </select>
      <button type="submit" disabled={progPending} className="rounded-full bg-neon-gradient px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
        {progPending ? "Saving…" : "Save"}
      </button>
      {progState.error ? <span className="text-xs text-red-500">{progState.error}</span> : null}
    </form>
  );

  if (promoters.length === 0) {
    return (
      <div className="space-y-2">
        {programToggle}
        {programSummary}
        <p className="text-sm text-muted">
          No promoters yet - share the event link; anyone who taps &quot;Promote this event&quot; shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {programToggle}
      {programSummary}
      <p className="flex items-center gap-2 text-xs text-muted">
        <Megaphone className="h-3.5 w-3.5" /> Promoter commission comes out of your payout - never the buyer.
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
