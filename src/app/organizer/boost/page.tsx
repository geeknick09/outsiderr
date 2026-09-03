import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { BoostPanel } from "@/components/organizer/boost-panel";
import { getCurrentUser } from "@/lib/auth";
import { listBoostSlotPrices, listOccupiedSlots } from "@/lib/data/boosts";
import { listOrganizerEvents } from "@/lib/data/organizer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Boost Event — Outsiderr" };

export default async function OrganizerBoostPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer%2Fboost");

  const params = await searchParams;
  const preselectedEventId = params.event;

  const [events, slotPrices, occupiedSlots] = await Promise.all([
    listOrganizerEvents(user),
    listBoostSlotPrices(),
    listOccupiedSlots(),
  ]);

  const platformUpiId = process.env.NEXT_PUBLIC_PLATFORM_UPI_ID ?? "outsiderr@upi";

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link href="/organizer" className="text-muted hover:text-violet-neon">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-black tracking-tight">Boost an Event</h1>
          <p className="text-sm text-muted">
            Feature your event in the homepage carousel to reach more people.
          </p>
        </div>
      </div>

      <BoostPanel
        events={events}
        slotPrices={slotPrices}
        occupiedSlots={occupiedSlots}
        platformUpiId={platformUpiId}
        preselectedEventId={preselectedEventId}
      />
    </div>
  );
}
