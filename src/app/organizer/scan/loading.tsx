import { BrandedLoader } from "@/modules/shared";

export default function OrganizerScanLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center py-6">
      <BrandedLoader size="lg" label="Loading scanner" />
    </div>
  );
}
