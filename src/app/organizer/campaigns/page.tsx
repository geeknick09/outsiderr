import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/shared/server";
import {
  listBoostSlotPrices,
  listOccupiedSlots,
  getHeroBoostPrice,
  getSlotBoostCount,
  getHeroMaxVisibleEvents,
} from "@/modules/shared/server";
import { getOrganizerGateContext, listOrganizerEvents } from "@/modules/organizer/server";
import { CampaignPanel } from "@/modules/organizer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Campaigns - Creator Dashboard | Outsiderr" };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; featured?: string }>;
}) {
  const params = await searchParams;
  const gate = await getOrganizerGateContext();
  if ("gate" in gate) return gate.gate;

  const [events, slotPrices, occupiedSlots, featurePrice, slotCount, featureMax] =
    await Promise.all([
      listOrganizerEvents(gate.user),
      listBoostSlotPrices(),
      listOccupiedSlots(),
      getHeroBoostPrice(),
      getSlotBoostCount(),
      getHeroMaxVisibleEvents(),
    ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted">
          Put your event in front of more people - feature it on top, grab a sponsored slot, or run ads.
        </p>
      </div>

      {params.featured === "1" ? (
        <div className="rounded-2xl bg-lime-400/15 px-4 py-3 text-sm text-lime-600 dark:text-lime-400">
          Your event is featured - it&apos;s live in the top carousel now.
        </div>
      ) : null}
      <CampaignPanel
        preselectedEventId={params.event}
        events={events}
        slotPrices={slotPrices}
        occupiedSlots={occupiedSlots}
        featurePricePaise={featurePrice}
        featureMaxVisible={featureMax}
        slotCount={slotCount}
      />
    </div>
  );
}
