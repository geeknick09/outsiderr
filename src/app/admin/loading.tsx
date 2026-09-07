/**
 * Admin loading skeleton.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass rounded-3xl p-5">
            <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
