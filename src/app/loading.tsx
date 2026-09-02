import { SkeletonGrid } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 py-6">
      {/* Featured carousel skeleton */}
      <div className="glass animate-pulse h-48 rounded-3xl bg-zinc-200 dark:bg-white/10" />
      {/* Category chips skeleton */}
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10"
          />
        ))}
      </div>
      <SkeletonGrid count={8} />
    </div>
  );
}
