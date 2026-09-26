import { BrandedLoader } from "@/modules/shared";

export default function OrganizerBoxOfficeLoading() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex justify-center py-4">
        <BrandedLoader size="lg" label="Loading box office" />
      </div>
      <div className="h-8 w-56 animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
      <div className="glass h-72 animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
