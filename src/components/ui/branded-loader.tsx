/**
 * Branded loading spinner using the Outsiderr neon-gradient.
 *
 * Renders a circular gradient ring that spins — used in loading.tsx
 * route-level suspense fallbacks and inline loading states.
 *
 * Sizes: sm (24px), md (40px), lg (64px)
 */

const SIZES = {
  sm: "h-5 w-5",
  md: "h-8 w-8",
  lg: "h-12 w-12",
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
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-12">
      <div className="glass flex flex-col items-center justify-center gap-2 rounded-3xl px-6 py-5 shadow-lg shadow-violet-500/10">
        <BrandedLoader size="sm" label={label} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {label}
        </p>
      </div>
    </div>
  );
}
