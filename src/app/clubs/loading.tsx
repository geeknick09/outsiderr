import { BrandedLoader } from "@/components/ui/branded-loader";
import { SkeletonGrid } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex justify-center py-4">
        <BrandedLoader size="lg" label="Loading clubs" />
      </div>
      <div className="h-8 w-40 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
      <SkeletonGrid count={6} />
    </div>
  );
}
