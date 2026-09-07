/**
 * Organizer event detail loading skeleton.
 */
export default function OrganizerEventLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          </div>
        ))}
      </div>
      <div className="glass h-64 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
