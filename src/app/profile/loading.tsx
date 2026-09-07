/**
 * Profile loading skeleton.
 */
export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="glass h-8 w-32 animate-pulse rounded-xl" />
      <div className="glass space-y-3 rounded-3xl p-6">
        <div className="h-20 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
        <div className="h-5 w-24 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
        <div className="h-12 w-full animate-pulse rounded-full bg-violet-200 dark:bg-violet-500/20" />
      </div>
    </div>
  );
}
