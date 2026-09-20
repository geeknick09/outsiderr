import "server-only";

import { createClient } from "../../shared/auth/server";
import type { CurrentUser } from "../../shared/auth/auth";
import { getOrganizerProfile, getEventAccessLevel } from "../../shared/server";

export async function getOrganizerEventAnalytics(
  user: CurrentUser,
  eventId: string,
): Promise<import("@/modules/shared").EventAnalytics | null> {
  const { getEventAnalytics } = await import("./admin-analytics");
  const { getEventAccessLevel, canViewAnalytics } = await import("@/modules/shared/server");
  // Verify the event belongs to this organizer OR they are an accepted collaborator
  const accessLevel = await getEventAccessLevel(user, eventId);
  if (!accessLevel || !canViewAnalytics(accessLevel)) return null;
  return getEventAnalytics(eventId);
}

/**
 * Get daily revenue for the last 30 days across all of the organizer's events.
 * Used by the aggregate analytics dashboard for the revenue trend chart.
 */
export async function getOrganizerDailyRevenue(
  user: CurrentUser,
): Promise<{ date: string; revenuePaise: number; orderCount: number }[]> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();

  // Get organizer's event IDs
  const { data: events } = await supabase
    .from("events")
    .select("id")
    .eq("organizer_id", organizer.id);

  const eventIds = (events ?? []).map((e) => e.id);
  if (eventIds.length === 0) return [];

  // Fetch confirmed orders for those events
  const { data: orders } = await supabase
    .from("orders")
    .select("total_paise, created_at")
    .in("event_id", eventIds)
    .eq("status", "CONFIRMED")
    .order("created_at", { ascending: false });

  const ords = orders ?? [];

  // Group by day
  const revenueMap = new Map<string, { revenuePaise: number; orderCount: number }>();
  for (const o of ords) {
    const day = (o.created_at ?? "").slice(0, 10);
    if (!day) continue;
    const existing = revenueMap.get(day) ?? { revenuePaise: 0, orderCount: 0 };
    existing.revenuePaise += o.total_paise ?? 0;
    existing.orderCount += 1;
    revenueMap.set(day, existing);
  }

  // Build last 30 days array
  const now = new Date();
  const dailyRevenue: { date: string; revenuePaise: number; orderCount: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    const entry = revenueMap.get(day);
    dailyRevenue.push({
      date: day,
      revenuePaise: entry?.revenuePaise ?? 0,
      orderCount: entry?.orderCount ?? 0,
    });
  }

  return dailyRevenue;
}

