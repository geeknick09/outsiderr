/**
 * Checkout loading skeleton — shown while the checkout page loads event/tier data.
 */
export default function CheckoutLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="glass h-8 w-48 animate-pulse rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div className="glass space-y-3 rounded-3xl p-6">
          <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
          <div className="h-5 w-28 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
          <div className="h-5 w-24 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
          <div className="h-12 w-full animate-pulse rounded-full bg-violet-200 dark:bg-violet-500/20" />
        </div>
        <div className="glass rounded-3xl p-6">
          <div className="h-5 w-20 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          <div className="mt-3 h-8 w-32 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          <div className="mt-4 h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}
