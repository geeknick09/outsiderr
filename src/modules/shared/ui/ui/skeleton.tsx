// Lightweight skeleton loaders for instant app-like feel

export function SkeletonCard() {
  return (
    <div className="glass animate-pulse rounded-3xl p-4">
      <div className="mb-3 aspect-[4/5] rounded-2xl bg-zinc-200 dark:bg-white/10" />
      <div className="mb-2 h-4 w-3/4 rounded bg-zinc-200 dark:bg-white/10" />
      <div className="mb-1 h-3 w-1/2 rounded bg-zinc-200 dark:bg-white/10" />
      <div className="h-3 w-1/3 rounded bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="glass animate-pulse rounded-2xl p-4">
      <div className="flex gap-3">
        <div className="h-12 w-12 shrink-0 rounded-xl bg-zinc-200 dark:bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonLine() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-full rounded bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
