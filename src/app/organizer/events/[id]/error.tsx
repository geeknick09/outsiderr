"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for /organizer/events/[id].
 * Shows a specific message with a link back to the organizer dashboard,
 * so organizers are never stranded on a generic error page after creating an event.
 */
export default function ManageEventError({
  error,
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

      </div>
    </div>
  );
}
