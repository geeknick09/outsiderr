import { SkeletonList } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 py-6">
      <div className="h-8 w-32 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
      <SkeletonList count={4} />
    </div>
  );
}
