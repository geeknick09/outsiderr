"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary for /organizer/events/[id].
 * Shows a specific message with recovery options so organizers are never
 * stranded on a generic error page after editing an event.
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
          There was a problem loading your event management page.
        </p>
        {error.digest ? (
          <p className="mt-1 font-mono text-xs text-zinc-400">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-violet-neon px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/organizer"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/15"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
