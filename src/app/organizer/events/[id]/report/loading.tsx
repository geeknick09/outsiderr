import { BrandedLoader } from "@/modules/shared";

export default function OrganizerReportLoading() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex justify-center py-4">
        <BrandedLoader size="lg" label="Loading report" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass h-28 animate-pulse rounded-2xl bg-zinc-200 dark:bg-white/10" />
        ))}
      </div>
      <div className="glass h-64 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
