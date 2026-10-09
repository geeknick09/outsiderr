"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { formatPaise } from "@/modules/shared";

/** Sales-over-time trend for a single event (confirmed orders per day). */
export function SalesTrendChart({
  data,
}: {
  data: { date: string; orders: number; tickets: number; revenuePaise: number }[];
}) {
  if (!data.length) {
    return (
      <div className="glass rounded-2xl p-5 text-sm text-muted">
        No sales yet — the trend will appear once bookings start.
      </div>
    );
  }
  const points = data.map((d) => ({
    ...d,
    label: new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
  }));
  return (
    <div className="glass rounded-2xl p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Sales over time
      </p>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="salesTrend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: "rgba(20,20,26,0.95)",
                border: "1px solid rgba(139,92,246,0.3)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={((value: unknown, name: unknown) =>
                name === "revenuePaise"
                  ? [formatPaise(Number(value ?? 0)), "Revenue"]
                  : [Number(value ?? 0), name === "tickets" ? "Tickets" : "Orders"]) as never}
              labelFormatter={((l: unknown) => `Date: ${l}`) as never}
            />
            <Area
              type="monotone"
              dataKey="tickets"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#salesTrend)"
              name="tickets"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
