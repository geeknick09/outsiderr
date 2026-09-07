/**
 * Club detail loading skeleton.
 */
export default function ClubDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="h-40 w-full animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10 sm:h-56" />
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}
