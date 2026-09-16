import Link from "next/link";

/**
 * Global 404 page — rendered when no route matches.
 * Matches the glass-card style of the error boundary.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="glass max-w-md rounded-3xl p-8">
        <h1 className="text-6xl font-black text-violet-neon">404</h1>
        <h2 className="mt-4 text-xl font-bold">Page not found</h2>
        <p className="mt-2 text-sm text-muted">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-violet-neon px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          >
            Go home
          </Link>
          <Link
            href="/events"
            className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-muted transition-all hover:border-violet-neon dark:border-white/10"
          >
            Browse events
          </Link>
        </div>
      </div>
    </div>
  );
}
