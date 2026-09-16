/**
 * Branded loading spinner using the Outsiderr neon-gradient.
 *
 * Renders a circular gradient ring that spins — used in loading.tsx
 * route-level suspense fallbacks and inline loading states.
 *
 * Sizes: sm (24px), md (40px), lg (64px)
 */

const SIZES = {
  sm: "h-6 w-6",
  md: "h-10 w-10",
  lg: "h-16 w-16",
} as const;

export function BrandedLoader({
  size = "md",
  label = "Loading",
}: {
  size?: keyof typeof SIZES;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex items-center justify-center"
    >
      <div
        className={`${SIZES[size]} animate-spin rounded-full`}
        style={{
          background:
            "conic-gradient(from 0deg, #8B5CF6, #EC4899, #8B5CF6)",
          maskImage: "radial-gradient(circle at center, transparent 55%, black 56%)",
          WebkitMaskImage: "radial-gradient(circle at center, transparent 55%, black 56%)",
        }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Full-page branded loader — centred spinner on a glass card.
 * Drop into any loading.tsx for an instant branded loading state.
 */
export function BrandedPageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center py-12">
      <div className="glass flex flex-col items-center gap-4 rounded-3xl px-12 py-10">
        <BrandedLoader size="lg" label={label} />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
      </div>
    </div>
  );
}
