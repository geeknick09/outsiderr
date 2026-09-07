import {
  getUserAnalytics,
  getPaymentAnalytics,
  getOrganizerAnalytics,
} from "@/lib/data/admin";
import { AnalyticsChartsLazy } from "@/components/admin/analytics-charts-lazy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Analytics — Outsiderr" };

export default async function AdminAnalyticsPage() {
  const [userAnalytics, paymentAnalytics, organizerAnalytics] = await Promise.all([
    getUserAnalytics(),
    getPaymentAnalytics(),
    getOrganizerAnalytics(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Analytics</h1>
        <p className="text-sm text-muted">
          User growth, payment trends, and organizer insights. Export reports as PDF.
        </p>
      </div>

      <AnalyticsChartsLazy
        userAnalytics={userAnalytics}
        paymentAnalytics={paymentAnalytics}
        organizerAnalytics={organizerAnalytics}
      />
    </div>
  );
}
