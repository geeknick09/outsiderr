/**
 * Login loading skeleton.
 */
export default function LoginLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="glass w-full max-w-sm space-y-4 rounded-3xl p-8">
        <div className="h-8 w-32 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
        <div className="h-12 w-full animate-pulse rounded-full bg-violet-200 dark:bg-violet-500/20" />
      </div>
    </div>
  );
}
