import { BoxOfficePageClient } from "@/modules/scanner";
import { createClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin Box Office — Outsiderr" };

export default async function AdminBoxOfficePage() {
  // Fetch all published events for the event selector.
  // Admin box office PINs have access to ALL events.
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, status, organizer_id")
    .in("status", ["PUBLISHED", "POSTPONED"])
    .order("starts_at", { ascending: true });

  // Get organizer names
  const organizerIds = [...new Set((events ?? []).map((e) => e.organizer_id))];
  const { data: organizers } = await supabase
    .from("organizers_public")
    .select("id, name")
    .in("id", organizerIds);
  const orgMap = Object.fromEntries((organizers ?? []).map((o) => [o.id, o.name]));

  const eventOptions = (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    organizerName: orgMap[e.organizer_id] ?? "Organizer",
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    status: e.status,
  }));

  // Fetch tiers for all events
  const eventIds = eventOptions.map((e) => e.id);
  const { data: tierRows } = eventIds.length > 0
    ? await supabase.from("ticket_tiers").select("id, event_id, name, price_paise").in("event_id", eventIds)
    : { data: null };

  const tiersByEvent: Record<string, { id: string; name: string; pricePaise: number }[]> = {};
  for (const tier of tierRows ?? []) {
    if (!tiersByEvent[tier.event_id]) tiersByEvent[tier.event_id] = [];
    tiersByEvent[tier.event_id].push({
      id: tier.id,
      name: tier.name,
      pricePaise: tier.price_paise,
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <BoxOfficePageClient events={eventOptions} tiers={tiersByEvent} />
    </div>
  );
}
