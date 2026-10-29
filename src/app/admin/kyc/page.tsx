import { listKycSubmissions, listKycCounts } from "@/modules/admin/server";
import { getCurrentUser } from "@/modules/shared/server";
import { TabLink } from "@/modules/shared";
import { KycReviewTable } from "@/modules/admin";
import { AdminKycRealtimeRefresher } from "@/modules/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: KYC Review - Outsiderr" };

export default async function AdminKycPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [submissions, counts, admin] = await Promise.all([
    listKycSubmissions(status),
    listKycCounts(),
    getCurrentUser(),
  ]);

  const filters = [
    { label: "Pending", value: "PENDING" },
    { label: "Change Requests", value: "CHANGES" },
    { label: "Clarification Needed", value: "CLARIFICATION_NEEDED" },
    { label: "Approved", value: "APPROVED" },
    { label: "Rejected", value: "REJECTED" },
    { label: "All", value: "ALL" },
  ];

  return (
    <div className="space-y-6">
      <AdminKycRealtimeRefresher />
      <div>
        <h1 className="text-2xl font-black">KYC Review</h1>
        <p className="text-sm text-muted">
          Review organizer KYC submissions. Approve to grant full organizer access, reject with a reason, or request clarification.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <TabLink
            key={f.value}
            href={`/admin/kyc?status=${f.value}`}
            active={(status ?? "PENDING") === f.value}
          >
            {f.label} ({counts[f.value] ?? 0})
          </TabLink>
        ))}
      </div>

      {/* Submissions */}
      {submissions.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-sm text-muted">No submissions in this category.</p>
        </div>
      ) : (
        <KycReviewTable submissions={submissions} adminEmail={admin?.email ?? null} />
      )}
    </div>
  );
}
