/**
 * Organizer profile loading skeleton.
 */
export default function OrganizerProfileLoading() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex items-end gap-4 px-2">
        <div className="h-20 w-20 animate-pulse rounded-2xl bg-zinc-200 dark:bg-white/10 sm:h-24 sm:w-24" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}
