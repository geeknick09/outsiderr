import "server-only";

import { createClient } from "../../shared/auth/server";
import type { CurrentUser } from "../../shared/auth/auth";
import { getOrganizerProfile } from "../../shared/server";

export async function getOrganizerEventAnalytics(
  user: CurrentUser,
  eventId: string,
): Promise<import("@/modules/shared").EventAnalytics | null> {
  const { getEventAnalytics } = await import("./admin-analytics");
  const { getEventAccessLevel, canViewAnalytics, canViewMoney } = await import("@/modules/shared/server");
  // Verify the event belongs to this organizer OR they are an accepted collaborator
  const accessLevel = await getEventAccessLevel(user, eventId);
  if (!accessLevel || !canViewAnalytics(accessLevel)) return null;
  const analytics = await getEventAnalytics(eventId);
  // LIMITED collaborators get operational analytics without any money fields.
  if (analytics && !canViewMoney(accessLevel)) {
    return {
      ...analytics,
      grossRevenuePaise: 0,
      commissionPaise: 0,
      convenienceFeePaise: 0,
      platformFeePaise: 0,
      netPayoutPaise: 0,
    };
  }
  return analytics;
}

/**
 * Get daily revenue for the last 30 days across all of the organizer's events.
 * Used by the aggregate analytics dashboard for the revenue trend chart.
 */
export async function getOrganizerDailyRevenue(
  user: CurrentUser,
  days = 30,
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
    .gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
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
  for (let i = days - 1; i >= 0; i--) {
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

export interface OrganizerAudienceAnalytics {
  /** Users with exactly 1 confirmed order vs >1 */
  newAttendees: number;
  returningAttendees: number;
  /** Age bands computed from profiles.birth_date (nullable -> "Unknown") */
  ageGroups: { label: string; count: number }[];
  gender: { label: string; count: number }[];
  /** Where attendees attend - bucketed by the event's city */
  cities: { label: string; count: number }[];
  /** Which event categories this organizer's attendees book most */
  categories: { label: string; count: number }[];
  /** Distinct confirmed attendees */
  totalAttendees: number;
}

function ageBand(birthDate: string | null): string {
  if (!birthDate) return "Unknown";
  const age = Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 18) return "Under 18";
  if (age <= 24) return "18-24";
  if (age <= 30) return "25-30";
  if (age <= 40) return "31-40";
  return "40+";
}

/**
 * Audience demographics + loyalty stats across all of the organizer's events.
 * One attendee = one distinct user with a CONFIRMED order; "returning" means
 * they hold confirmed orders for more than one of the organizer's events.
 */
export async function getOrganizerAudienceAnalytics(
  user: CurrentUser,
  windowDays = 90,
): Promise<OrganizerAudienceAnalytics | null> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return null;

  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("user_id, events!inner(category, city), profiles!inner(birth_date, gender)")
    .eq("status", "CONFIRMED")
    .eq("events.organizer_id", organizer.id)
    .gte("created_at", new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString());

  if (!orders || orders.length === 0) {
    return {
      newAttendees: 0, returningAttendees: 0, ageGroups: [], gender: [],
      cities: [], categories: [], totalAttendees: 0,
    };
  }

  const perUser = new Map<string, { orders: number; birth: string | null; gender: string | null }>();
  const cityCount = new Map<string, number>();
  const catCount = new Map<string, number>();

  for (const o of orders as unknown as {
    user_id: string;
    events: { category: string; city: string };
    profiles: { birth_date: string | null; gender: string | null };
  }[]) {
    const entry = perUser.get(o.user_id) ?? {
      orders: 0,
      birth: o.profiles?.birth_date ?? null,
      gender: o.profiles?.gender ?? null,
    };
    entry.orders += 1;
    perUser.set(o.user_id, entry);
    cityCount.set(o.events.city, (cityCount.get(o.events.city) ?? 0) + 1);
    catCount.set(o.events.category, (catCount.get(o.events.category) ?? 0) + 1);
  }

  const ageMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  let returning = 0;
  let fresh = 0;
  for (const entry of perUser.values()) {
    if (entry.orders > 1) returning++; else fresh++;
    const band = ageBand(entry.birth);
    ageMap.set(band, (ageMap.get(band) ?? 0) + 1);
    const g = entry.gender ?? "Unknown";
    genderMap.set(g, (genderMap.get(g) ?? 0) + 1);
  }

  const toSorted = (m: Map<string, number>) =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  return {
    newAttendees: fresh,
    returningAttendees: returning,
    ageGroups: toSorted(ageMap),
    gender: toSorted(genderMap),
    cities: toSorted(cityCount),
    categories: toSorted(catCount),
    totalAttendees: perUser.size,
  };
}


/**
 * Organizer-wide payment summary + hourly sales distribution.
 * "Trend by time" = which hours of the day orders land (IST).
 */
export async function getOrganizerPaymentSummary(user: CurrentUser): Promise<{
  grossPaise: number;
  feesPaise: number;
  netPayoutPaise: number;
  refundedPaise: number;
  orderCount: number;
  hourly: { hour: number; orders: number; revenuePaise: number }[];
} | null> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return null;
  const supabase = await createClient();

  const { data: events } = await supabase.from("events").select("id").eq("organizer_id", organizer.id);
  const ids = (events ?? []).map((e) => e.id);
  if (ids.length === 0) return { grossPaise: 0, feesPaise: 0, netPayoutPaise: 0, refundedPaise: 0, orderCount: 0, hourly: [] };

  const [{ data: orders }, { data: refunds }] = await Promise.all([
    supabase
      .from("orders")
      .select("subtotal_paise, commission_paise, convenience_fee_paise, platform_fee_paise, organizer_payout_paise, created_at")
      .in("event_id", ids)
      .eq("status", "CONFIRMED"),
    supabase
      .from("refunds")
      .select("amount_paise")
      .in("event_id", ids)
      .neq("status", "REJECTED"),
  ]);

  const ords = orders ?? [];
  const hourlyMap = new Map<number, { orders: number; revenuePaise: number }>();
  for (const o of ords) {
    if (!o.created_at) continue;
    const hour = new Date(o.created_at).getHours();
    const h = hourlyMap.get(hour) ?? { orders: 0, revenuePaise: 0 };
    h.orders += 1;
    h.revenuePaise += o.subtotal_paise ?? 0;
    hourlyMap.set(hour, h);
  }

  return {
    grossPaise: ords.reduce((s, o) => s + (o.subtotal_paise ?? 0), 0),
    feesPaise: ords.reduce((s, o) => s + (o.commission_paise ?? 0) + (o.convenience_fee_paise ?? 0) + (o.platform_fee_paise ?? 0), 0),
    netPayoutPaise: ords.reduce((s, o) => s + (o.organizer_payout_paise ?? 0), 0),
    refundedPaise: (refunds ?? []).reduce((s, r) => s + (r.amount_paise ?? 0), 0),
    orderCount: ords.length,
    hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, ...(hourlyMap.get(h) ?? { orders: 0, revenuePaise: 0 }) })),
  };
}
