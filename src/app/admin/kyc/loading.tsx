/**
 * KYC review loading skeleton.
 */
import { BrandedLoader } from "@/modules/shared";

export default function KycLoading() {
  return (
    <div className="space-y-6">
      <div className="flex justify-center py-4">
        <BrandedLoader size="lg" label="Loading KYC submissions" />
      </div>
      <div className="h-8 w-48 animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-28 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass rounded-3xl p-5">
            <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
            <div className="mt-3 h-20 animate-pulse rounded-2xl bg-zinc-200 dark:bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
