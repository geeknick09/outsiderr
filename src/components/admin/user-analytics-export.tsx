"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { AdminUser } from "@/lib/types";
import type { UserAnalytics } from "@/lib/data/admin";

export function UserAnalyticsExport({
  analytics,
  users,
}: {
  analytics: UserAnalytics;
  users: AdminUser[];
}) {
  const [generating, setGenerating] = useState(false);

  function handleExport() {
    setGenerating(true);
    try {
      const doc = new jsPDF();
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Title
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Outsiderr — User Analytics Report", 14, 22);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Generated: ${dateStr}`, 14, 30);
      doc.text(`Total Users: ${analytics.totalUsers}`, 14, 36);

      // Summary table
      autoTable(doc, {
        startY: 44,
        head: [["Metric", "Value", "Notes"]],
        body: [
          ["Total Users", String(analytics.totalUsers), "All registered profiles"],
          ["Active Users", String(analytics.activeUsers), "Users with ≥1 confirmed order"],
          ["Organizers", String(analytics.organizersCount), "Verified and unverified"],
          ["DAU", String(analytics.dau), "Distinct users active today"],
          ["MAU", String(analytics.mau), "Distinct users active in last 30 days"],
          ["Returning Users", String(analytics.returningUsers), "Users with 2+ orders"],
          ["Non-Returning", String(analytics.nonReturningUsers), "Users with exactly 1 order"],
          ["New This Month", String(analytics.newUsersThisMonth), "Joined this calendar month"],
          ["New Today", String(analytics.newUsersToday), "Joined today"],
        ],
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
      });

      // Daily signups chart (as table)
      const afterSignups = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text("Daily Signups (Last 30 Days)", 14, afterSignups);

      autoTable(doc, {
        startY: afterSignups + 4,
        head: [["Date", "New Signups"]],
        body: analytics.dailySignups.map((d) => [d.date, String(d.count)]),
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
      });

      // Daily active users
      const afterActive = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Daily Active Users (Last 30 Days)", 14, afterActive);

      autoTable(doc, {
        startY: afterActive + 4,
        head: [["Date", "Active Users"]],
        body: analytics.dailyActive.map((d) => [d.date, String(d.count)]),
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
      });

      // Full user list on a new page
      doc.addPage();
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Complete User List", 14, 20);

      autoTable(doc, {
        startY: 26,
        head: [["Name", "Phone", "Organizer", "Admin", "Joined"]],
        body: users.map((u) => [
          u.fullName ?? "—",
          u.phone ?? "—",
          u.isOrganizer ? "Yes" : "No",
          u.isAdmin ? "Yes" : "No",
          u.createdAt.slice(0, 10),
        ]),
        theme: "striped",
        headStyles: { fillColor: [139, 92, 246] },
        styles: { fontSize: 8 },
      });

      doc.save(`outsiderr-user-analytics-${now.toISOString().slice(0, 10)}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={generating}
      className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon disabled:opacity-50 dark:border-white/10"
    >
      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Export PDF
    </button>
  );
}
