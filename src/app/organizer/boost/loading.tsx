import { BrandedLoader } from "@/modules/shared";

export default function OrganizerBoostLoading() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex justify-center py-4">
        <BrandedLoader size="lg" label="Loading boost options" />
      </div>
      <div className="glass h-48 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-white/10" />
        ))}
      </div>
    </div>
  );
}
