import { listKycSubmissions } from "@/lib/data/kyc";
import { KycReviewCard } from "@/components/admin/kyc-review-card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: KYC Review — Outsiderr" };

export default async function AdminKycPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const submissions = await listKycSubmissions(status);

  const filters = [
    { label: "Pending", value: "PENDING" },
    { label: "Clarification Needed", value: "CLARIFICATION_NEEDED" },
    { label: "Approved", value: "APPROVED" },
    { label: "Rejected", value: "REJECTED" },
    { label: "All", value: "ALL" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">KYC Review</h1>
        <p className="text-sm text-muted">
          Review organizer KYC submissions. Approve to grant full organizer access, reject with a reason, or request clarification.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <a
            key={f.value}
            href={`/admin/kyc?status=${f.value}`}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${
              (status ?? "PENDING") === f.value
                ? "bg-violet-neon text-white"
                : "border border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      {/* Submissions */}
      {submissions.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-sm text-muted">No submissions in this category.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => (
            <KycReviewCard key={s.id} submission={s} />
          ))}
        </div>
      )}
    </div>
  );
}
