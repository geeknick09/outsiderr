"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary for /organizer/events/[id].
 * Shows a specific message with a link back to the organizer dashboard,
 * so organizers are never stranded on a generic error page after creating an event.
 */
export default function ManageEventError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[organizer-event-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="glass max-w-md rounded-3xl p-8">
        <h2 className="text-xl font-bold">Could not load event</h2>
        <p className="mt-2 text-sm text-muted">
          There was a problem loading your event management page. Your event may
          still have been created successfully.
        </p>
        {error.digest ? (
          <p className="mt-1 font-mono text-xs text-zinc-400">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-full bg-violet-neon px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/organizer?tab=events"
            className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-muted transition-all hover:border-violet-neon dark:border-white/10"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
