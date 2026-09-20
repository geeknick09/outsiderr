import "server-only";

import { createClient } from "../auth/server";
import type { Ticket } from "../lib/types";

export async function listEventTickets(eventId: string): Promise<Ticket[]> {
  // No admin guard here — RLS policies ensure organizers can only see their own events' tickets
  const supabase = await createClient();
  const [{ data: rows }, { data: eventRow }] = await Promise.all([
    supabase.from("tickets").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.from("events").select("title, starts_at, venue_name").eq("id", eventId).single(),
  ]);
  if (!rows) return [];
  const tierIds = [...new Set(rows.map((r) => r.tier_id))];
  const { data: tiers } = await supabase.from("ticket_tiers").select("id, name").in("id", tierIds);
  const tierMap = Object.fromEntries((tiers ?? []).map((t) => [t.id, t.name]));

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    eventId,
    eventTitle: eventRow?.title ?? "Event",
    tierName: tierMap[row.tier_id] ?? "Ticket",
    qrHash: row.qr_hash,
    status: row.status,
    checkedInAt: row.checked_in_at,
    startsAt: eventRow?.starts_at ?? new Date().toISOString(),
    venueName: eventRow?.venue_name ?? "",
  }));
}

// ---------------------------------------------------------------- revenue analytics
