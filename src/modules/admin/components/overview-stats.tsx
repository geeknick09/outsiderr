"use client";

import { useState } from "react";
import { X, Download } from "lucide-react";

import { getOverviewDrilldownAction } from "@/modules/admin/actions/overview";

export interface OverviewCard {
  label: string;
  value: string;
  sub?: string;
  kind: string;
}

/** Clickable stat cards - click opens a modal with the underlying rows and
 * a CSV export. Filter props are forwarded to the drill-down query. */
export function OverviewStats({
  cards,
  filter,
}: {
  cards: OverviewCard[];
  filter: { city?: string; from?: string; to?: string };
}) {
  const [open, setOpen] = useState<OverviewCard | null>(null);
  const [data, setData] = useState<{ columns: string[]; rows: string[][] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function openCard(card: OverviewCard) {
    if (!card.kind) return;
    setOpen(card);
    setLoading(true);
    setData(null);
    const r = await getOverviewDrilldownAction(card.kind, filter);
    setData(r);
    setLoading(false);
  }

  function exportCsv() {
    if (!open || !data) return;
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const csv = [data.columns.map(esc).join(","), ...data.rows.map((r) => r.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${open.kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.label + card.kind}
            onClick={() => openCard(card)}
            disabled={!card.kind}
            className="glass rounded-3xl p-5 text-left transition-all hover:border-violet-neon/60 disabled:cursor-default disabled:opacity-100"
          >
            <p className="mb-1 text-xs text-muted">{card.label}</p>
            <p className="text-2xl font-black">{card.value}</p>
            {card.sub ? <p className="mt-1 text-xs text-muted">{card.sub}</p> : null}
          </button>
        ))}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          <div
            className="glass max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="text-lg font-black">{open.label}</h3>
                <p className="text-xs text-muted">
                  {data ? `${data.rows.length} row${data.rows.length === 1 ? "" : "s"}` : "Loading…"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {data && data.rows.length > 0 ? (
                  <button
                    onClick={exportCsv}
                    className="flex items-center gap-1.5 rounded-full border border-violet-neon/40 px-3 py-1.5 text-xs font-bold text-violet-neon transition-colors hover:bg-violet-neon/10"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                ) : null}
                <button onClick={() => setOpen(null)} className="text-muted hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto p-5">
              {loading ? (
                <p className="py-10 text-center text-sm text-muted">Loading…</p>
              ) : data && data.rows.length > 0 ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-muted dark:border-white/10">
                      {data.columns.map((c) => (
                        <th key={c} className="px-2 py-2">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                        {row.map((cell, j) => (
                          <td key={j} className="max-w-[220px] truncate px-2 py-2.5">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="py-10 text-center text-sm text-muted">No rows for this filter.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
