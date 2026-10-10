"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

import { formatPaise } from "@/modules/shared";

type PaymentSummary = {
  grossPaise: number;
  feesPaise: number;
  netPayoutPaise: number;
  refundedPaise: number;
  orderCount: number;
  hourly: { hour: number; orders: number; revenuePaise: number }[];
};

const fmtHour = (h: number) => {
  const ampm = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${ampm}`;
};

/** Organizer-wide money summary + hourly sales pattern ("trend by time"). */
export function OrganizerPaymentsPanel({ summary }: { summary: PaymentSummary }) {
  const cards = [
    { label: "Confirmed orders", value: String(summary.orderCount) },
    { label: "Gross sales", value: formatPaise(summary.grossPaise) },
    { label: "Platform fees + commission", value: formatPaise(summary.feesPaise) },
    { label: "Refunded", value: formatPaise(summary.refundedPaise) },
    { label: "Net payout", value: formatPaise(summary.netPayoutPaise), accent: true },
  ];
  const hourly = summary.hourly.map((h) => ({ ...h, label: fmtHour(h.hour) }));
  const hasHourly = hourly.some((h) => h.orders > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="glass rounded-2xl p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.label}</p>
            <p className={`mt-1 text-lg font-black ${c.accent ? "text-lime-500" : ""}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {hasHourly ? (
        <div className="glass rounded-2xl p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Sales by time of day (all events)
          </p>
          <div className="h-40 w-full">
            <ResponsiveContainer>
              <BarChart data={hourly} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} stroke="currentColor" opacity={0.5} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} stroke="currentColor" opacity={0.5} />
                <Tooltip
                  formatter={(v) => [typeof v === "number" ? v : 0, "Orders"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="orders" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
