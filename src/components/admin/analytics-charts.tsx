"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

import { formatPaise } from "@/lib/format";
import type {
  UserAnalytics,
  PaymentAnalytics,
  OrganizerAnalytics,
} from "@/lib/data/admin";

const PIE_COLORS = ["#8b5cf6", "#ec4899", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

function formatDateShort(date: string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function AnalyticsCharts({
  userAnalytics,
  paymentAnalytics,
  organizerAnalytics,
}: {
  userAnalytics: UserAnalytics;
  paymentAnalytics: PaymentAnalytics;
  organizerAnalytics: OrganizerAnalytics;
}) {
  const [exporting, setExporting] = useState(false);

  // Prepare chart data
  const signupData = userAnalytics.dailySignups.map((d) => ({
    date: formatDateShort(d.date),
    signups: d.count,
  }));

  const activeData = userAnalytics.dailyActive.map((d) => ({
    date: formatDateShort(d.date),
    active: d.count,
  }));

  const revenueData = paymentAnalytics.dailyRevenue.map((d) => ({
    date: formatDateShort(d.date),
    revenue: Math.round(d.revenuePaise / 100), // convert to rupees for display
    orders: d.orderCount,
  }));

  const newOrgData = organizerAnalytics.dailyNewOrganizers.map((d) => ({
    date: formatDateShort(d.date),
    organizers: d.count,
  }));

  const methodData = paymentAnalytics.paymentMethods.map((m) => ({
    name: m.method,
    value: m.count,
    volume: m.volumePaise,
  }));

  function handleExport() {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-IN", {
        year: "numeric", month: "long", day: "numeric",
      });

      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Outsiderr — Analytics Report", 14, 22);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Generated: ${dateStr}`, 14, 30);

      // User Analytics Summary
      doc.setTextColor(0);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("User Analytics", 14, 42);

      autoTable(doc, {
        startY: 46,
        head: [["Metric", "Value"]],
        body: [
          ["Total Users", String(userAnalytics.totalUsers)],
          ["Active Users", String(userAnalytics.activeUsers)],
          ["Organizers", String(userAnalytics.organizersCount)],
          ["DAU", String(userAnalytics.dau)],
          ["MAU", String(userAnalytics.mau)],
          ["Returning Users", String(userAnalytics.returningUsers)],
          ["Non-Returning", String(userAnalytics.nonReturningUsers)],
          ["New This Month", String(userAnalytics.newUsersThisMonth)],
        ],
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
      });

      // Payment Analytics
      const afterPayment = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Payment Analytics", 14, afterPayment);

      autoTable(doc, {
        startY: afterPayment + 4,
        head: [["Metric", "Value"]],
        body: [
          ["Total Payments", String(paymentAnalytics.totalPayments)],
          ["Confirmed Payments", String(paymentAnalytics.confirmedPayments)],
          ["Total Volume", formatPaise(paymentAnalytics.totalVolumePaise)],
          ["Avg Order Value", formatPaise(paymentAnalytics.avgOrderValuePaise)],
        ],
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
      });

      // Payment methods
      const afterMethods = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Payment Methods Breakdown", 14, afterMethods);

      autoTable(doc, {
        startY: afterMethods + 4,
        head: [["Method", "Count", "Volume"]],
        body: paymentAnalytics.paymentMethods.map((m) => [
          m.method, String(m.count), formatPaise(m.volumePaise),
        ]),
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
      });

      // Daily revenue
      doc.addPage();
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Daily Revenue (Last 30 Days)", 14, 20);

      autoTable(doc, {
        startY: 26,
        head: [["Date", "Revenue", "Orders"]],
        body: paymentAnalytics.dailyRevenue.map((d) => [
          d.date, formatPaise(d.revenuePaise), String(d.orderCount),
        ]),
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
        styles: { fontSize: 8 },
      });

      // Organizer Analytics
      const afterOrg = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Organizer Analytics", 14, afterOrg);

      autoTable(doc, {
        startY: afterOrg + 4,
        head: [["Metric", "Value"]],
        body: [
          ["Total Organizers", String(organizerAnalytics.totalOrganizers)],
          ["Verified Organizers", String(organizerAnalytics.verifiedOrganizers)],
          ["Total Events", String(organizerAnalytics.totalEvents)],
        ],
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
      });

      // Top organizers
      const afterTop = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Top Organizers by Revenue", 14, afterTop);

      autoTable(doc, {
        startY: afterTop + 4,
        head: [["Organizer", "Events", "Revenue"]],
        body: organizerAnalytics.topOrganizers.map((o) => [
          o.name, String(o.eventCount), formatPaise(o.revenuePaise),
        ]),
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
      });

      doc.save(`outsiderr-analytics-${now.toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon disabled:opacity-50 dark:border-white/10"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Report (PDF)
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Total Users" value={String(userAnalytics.totalUsers)} />
        <SummaryCard label="DAU" value={String(userAnalytics.dau)} accent="text-violet-neon" />
        <SummaryCard label="MAU" value={String(userAnalytics.mau)} accent="text-pink-neon" />
        <SummaryCard label="Organizers" value={String(organizerAnalytics.totalOrganizers)} accent="text-lime-neon" />
        <SummaryCard label="Total Volume" value={formatPaise(paymentAnalytics.totalVolumePaise)} accent="text-emerald-400" />
        <SummaryCard label="Avg Order" value={formatPaise(paymentAnalytics.avgOrderValuePaise)} />
        <SummaryCard label="Confirmed Payments" value={String(paymentAnalytics.confirmedPayments)} />
        <SummaryCard label="Returning Users" value={String(userAnalytics.returningUsers)} accent="text-cyan-400" />
      </div>

      {/* Daily Signups */}
      <ChartCard title="Daily New Signups (Last 30 Days)">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={signupData}>
            <defs>
              <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 12 }}
              labelStyle={{ color: "#888" }}
            />
            <Area type="monotone" dataKey="signups" stroke="#8b5cf6" fill="url(#signupGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Daily Active Users */}
      <ChartCard title="Daily Active Users (Last 30 Days)">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={activeData}>
            <defs>
              <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 12 }}
              labelStyle={{ color: "#888" }}
            />
            <Area type="monotone" dataKey="active" stroke="#ec4899" fill="url(#activeGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Daily Revenue */}
      <ChartCard title="Daily Revenue (Last 30 Days) — in ₹">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 12 }}
              labelStyle={{ color: "#888" }}
              formatter={(value) => [`₹${value}`, "Revenue"]}
            />
            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Two-column: Payment methods + New organizers */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment methods pie */}
        {methodData.length > 0 ? (
          <ChartCard title="Payment Methods">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={methodData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                >
                  {methodData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 12 }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <ChartCard title="Payment Methods">
            <p className="py-12 text-center text-sm text-muted">No payment data yet.</p>
          </ChartCard>
        )}

        {/* New organizers line chart */}
        <ChartCard title="New Organizers (Last 30 Days)">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={newOrgData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 12 }}
                labelStyle={{ color: "#888" }}
              />
              <Line type="monotone" dataKey="organizers" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Top organizers table */}
      {organizerAnalytics.topOrganizers.length > 0 ? (
        <ChartCard title="Top Organizers by Revenue">
          <div className="space-y-2">
            {organizerAnalytics.topOrganizers.map((org, i) => (
              <div key={org.organizerId} className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-neon/10 text-sm font-bold text-violet-neon">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{org.name}</p>
                    <p className="text-xs text-muted">{org.eventCount} event{org.eventCount === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-emerald-400">{formatPaise(org.revenuePaise)}</p>
              </div>
            ))}
          </div>
        </ChartCard>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-black ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-5">
      <h3 className="mb-4 text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}
