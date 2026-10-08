"use client";

import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

import type { OrganizerAudienceAnalytics } from "../data/organizer-analytics";
import { CATEGORY_LABELS } from "@/modules/shared";

const PIE_COLORS = ["#8b5cf6", "#ec4899", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#a3a3a3"];

const AGE_ORDER = ["Under 18", "18-24", "25-30", "31-40", "40+", "Unknown"];

export function AudienceAnalytics({ data }: { data: OrganizerAudienceAnalytics }) {
  if (data.totalAttendees === 0) {
    return (
      <div className="glass rounded-3xl p-5 text-sm text-muted">
        No confirmed attendees yet - audience insights appear once tickets sell.
      </div>
    );
  }

  const loyaltyData = [
    { name: "New", value: data.newAttendees },
    { name: "Returning", value: data.returningAttendees },
  ];
  const ageData = [...data.ageGroups].sort(
    (a, b) => AGE_ORDER.indexOf(a.label) - AGE_ORDER.indexOf(b.label),
  );
  const catData = data.categories.map((c) => ({
    ...c,
    label: CATEGORY_LABELS[c.label as keyof typeof CATEGORY_LABELS] ?? c.label,
  }));
  const returningPct = Math.round((data.returningAttendees / data.totalAttendees) * 100);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Unique attendees" value={String(data.totalAttendees)} />
        <Stat label="Returning" value={`${data.returningAttendees}`} sub={`${returningPct}% of attendees`} />
        <Stat label="New" value={`${data.newAttendees}`} sub={`${100 - returningPct}% of attendees`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="New vs returning attendees">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={loyaltyData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3}>
                {loyaltyData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Age groups">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Audience by event city">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.cities.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Gender split">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.gender} dataKey="count" nameKey="label" innerRadius={55} outerRadius={80} paddingAngle={3}>
                {data.gender.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="What your audience books - category trends">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={catData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a1a1aa" }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} />
            <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-4">
      <p className="mb-3 text-sm font-bold">{title}</p>
      {children}
    </div>
  );
}
