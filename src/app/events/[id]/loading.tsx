export default function Loading() {
  return (
    <div className="space-y-6 py-6">
      {/* Banner skeleton */}
      <div className="aspect-[16/9] animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
      {/* Title skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
      </div>
      {/* Content skeleton */}
      <div className="glass space-y-3 rounded-3xl p-5">
        <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        <div className="h-4 w-4/6 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
      </div>
      {/* Ticket tiers skeleton */}
      <div className="glass h-32 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
