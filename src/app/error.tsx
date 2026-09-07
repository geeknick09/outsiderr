"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Root error boundary — catches any unhandled error in a route segment.
 * Renders a user-friendly error page with a retry button.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="glass max-w-md rounded-3xl p-8">
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest ? (
          <p className="mt-1 font-mono text-xs text-zinc-400">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-full bg-violet-neon px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-muted transition-all hover:border-violet-neon dark:border-white/10"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
