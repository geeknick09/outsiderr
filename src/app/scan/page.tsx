import { ScanPageClient } from "@/modules/scanner";

export const dynamic = "force-dynamic";

export const metadata = { title: "Door Scanner - Outsiderr" };

export default function ScanPage() {
  // Staff sign in with the phone/email + password their organizer set, then
  // pick one of their assigned events. No Supabase auth required - the staff
  // credential is the auth.
  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <ScanPageClient />
    </div>
  );
}
