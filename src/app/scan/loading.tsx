/**
 * Scan page loading skeleton.
 */
import { BrandedLoader } from "@/components/ui/branded-loader";

export default function ScanLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex justify-center py-4">
        <BrandedLoader size="md" label="Loading scanner" />
      </div>
      <div className="h-8 w-32 animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
      <div className="glass aspect-square w-full animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
