import { ScanPageClient } from "@/components/scan/scan-page-client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Door Scanner — Outsiderr" };

export default async function ScanPage() {
  // Fetch all published events for the event selector.
  // No Supabase auth required — PIN is the credential.
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, status, organizer_id")
    .in("status", ["PUBLISHED", "POSTPONED"])
    .order("starts_at", { ascending: true });

  // Get organizer names
  const organizerIds = [...new Set((events ?? []).map((e) => e.organizer_id))];
  const { data: organizers } = await supabase
    .from("organizers")
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

  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <ScanPageClient events={eventOptions} />
    </div>
  );
}
