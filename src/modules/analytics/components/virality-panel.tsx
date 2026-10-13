"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { TrendingUp } from "lucide-react";

const COLORS = ["#8B5CF6", "#3f3f46"];

export interface ViralityPie {
  title: string;
  referredLabel: string;
  organicLabel: string;
  referred: number;
  organic: number;
}

function KLabel({ value }: { value: number }) {
  const tone = value >= 1 ? "text-lime-neon" : value > 0 ? "text-violet-neon" : "text-muted";
  return <span className={`text-3xl font-black ${tone}`}>K = {value.toFixed(2)}</span>;
}

/** Virality section - K-factor headline + referred-vs-organic pies + optional
 * per-entity table (organizer view). */
export function ViralityPanel({
  coefficient,
  pies,
  entities,
}: {
  coefficient: number;
  pies: ViralityPie[];
  entities?: {
    id: string;
    name: string;
    kind: "EVENT" | "COMMUNITY";
    referred: number;
    organic: number;
    k: number;
  }[];
}) {
  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-neon/10">
            <TrendingUp className="h-5 w-5 text-violet-neon" />
          </div>
          <div>
            <p className="text-sm font-bold">Virality coefficient</p>
            <p className="text-xs text-muted">
              Referred acquisitions ÷ organic. K &gt; 1.0 means growth compounds.
            </p>
          </div>
        </div>
        <KLabel value={coefficient} />
      </div>

      {pies.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {pies.map((pie) => (
            <div key={pie.title} className="glass rounded-3xl p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{pie.title}</p>
              {pie.referred + pie.organic > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: pie.referredLabel, value: pie.referred },
                        { name: pie.organicLabel, value: pie.organic },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted">No data yet.</p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {entities && entities.length > 0 ? (
        <div className="glass overflow-hidden rounded-3xl">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-muted dark:border-white/10">
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Referred</th>
                <th className="px-4 py-3 text-right">Organic</th>
                <th className="px-4 py-3 text-right">K</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                  <td className="max-w-[220px] truncate px-4 py-3 font-semibold">{e.name}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {e.kind === "EVENT" ? "Event" : "Community"}
                  </td>
                  <td className="px-4 py-3 text-right">{e.referred}</td>
                  <td className="px-4 py-3 text-right">{e.organic}</td>
                  <td className={`px-4 py-3 text-right font-black ${e.k >= 1 ? "text-lime-neon" : ""}`}>
                    {e.k.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
