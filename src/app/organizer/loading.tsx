import { BrandedLoader } from "@/components/ui/branded-loader";

export default function Loading() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex justify-center py-4">
        <BrandedLoader size="lg" label="Loading dashboard" />
      </div>
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="glass h-28 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10"
          />
        ))}
      </div>
      <div className="glass h-96 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
