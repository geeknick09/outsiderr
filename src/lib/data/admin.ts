import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  AdminEvent,
  AdminStats,
  AdminUser,
  EventAnalytics,
  EventCategory,
  EventStatus,
  Order,
  PricingMode,
  Ticket,
  City,
} from "@/lib/types";

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();
  const [events, orders, boosts, heroBoosts] = await Promise.all([
    supabase.from("events").select("id, status"),
    supabase.from("orders").select("id, status, total_paise, subtotal_paise, platform_fee_paise, commission_paise, convenience_fee_paise, organizer_payout_paise"),
    supabase.from("boosts").select("id, status"),
    supabase.from("hero_boosts").select("id, status"),
  ]);
  const evts = events.data ?? [];
  const ords = orders.data ?? [];
  const bsts = boosts.data ?? [];
  const hbsts = heroBoosts.data ?? [];
  const confirmed = ords.filter((o) => o.status === "CONFIRMED");
  return {
    totalEvents: evts.length,
    activeEvents: evts.filter((e) => e.status === "PUBLISHED").length,
    totalOrders: ords.length,
    pendingOrders: ords.filter((o) => o.status === "PENDING_VERIFICATION").length,
    totalRevenuePaise: confirmed.reduce((s, o) => s + o.total_paise, 0),
    grossRevenuePaise: confirmed.reduce((s, o) => s + (o.subtotal_paise ?? 0), 0),
    totalCommissionPaise: confirmed.reduce((s, o) => s + (o.commission_paise ?? 0), 0),
    totalConvenienceFeePaise: confirmed.reduce((s, o) => s + (o.convenience_fee_paise ?? 0), 0),
    totalPlatformFeePaise: confirmed.reduce((s, o) => s + (o.platform_fee_paise ?? 0), 0),
    totalOrganizerPayoutPaise: confirmed.reduce((s, o) => s + (o.organizer_payout_paise ?? 0), 0),
    activeBoosts: bsts.filter((b) => b.status === "ACTIVE").length
      + hbsts.filter((b) => b.status === "ACTIVE").length,
    pendingBoosts: bsts.filter((b) => b.status === "PENDING").length
      + hbsts.filter((b) => b.status === "PENDING").length,
  };
}

export async function listAllAdminEvents(filters?: {
  search?: string;
  status?: EventStatus | "all";
  city?: City | "all";
  category?: EventCategory | "all";
}): Promise<AdminEvent[]> {
  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("id, title, description, category, city, status, starts_at, ends_at, venue_name, venue_address, is_featured, registrations_count, organizer_id, pricing_mode, commission_bps, commission_enabled, convenience_fee_bps, convenience_fee_enabled")
    .order("starts_at", { ascending: false });

  if (filters?.search) {
    query = query.ilike("title", `%${filters.search}%`);
  }
  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.city && filters.city !== "all") {
    query = query.eq("city", filters.city);
  }
  if (filters?.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  const { data } = await query;

  // Fetch organizer names separately (avoids Supabase type issues with joins)
  const organizerIds = [...new Set((data ?? []).map((r) => r.organizer_id).filter(Boolean))];
  const { data: organizers } = await supabase
    .from("organizers")
    .select("id, name")
    .in("id", organizerIds);
  const orgMap = Object.fromEntries((organizers ?? []).map((o) => [o.id, o.name]));

  return (data ?? []).map((row) => ({
    id: row.id, title: row.title,
    description: (row as { description?: string }).description ?? "",
    category: row.category as EventCategory,
    city: row.city as City,
    status: row.status as EventStatus,
    startsAt: row.starts_at,
    endsAt: (row as { ends_at?: string | null }).ends_at ?? row.starts_at,
    venueName: (row as { venue_name?: string | null }).venue_name ?? "",
    venueAddress: (row as { venue_address?: string | null }).venue_address ?? "",
    organizerName: orgMap[row.organizer_id] ?? "Organizer",
    registrationsCount: row.registrations_count,
    isFeatured: row.is_featured,
    pricingMode: (row as { pricing_mode?: string }).pricing_mode as PricingMode | undefined,
    commissionBps: (row as { commission_bps?: number }).commission_bps ?? 1000,
    commissionEnabled: (row as { commission_enabled?: boolean }).commission_enabled ?? true,
    convenienceFeeBps: (row as { convenience_fee_bps?: number }).convenience_fee_bps ?? 200,
    convenienceFeeEnabled: (row as { convenience_fee_enabled?: boolean }).convenience_fee_enabled ?? true,
  }));
}

export async function listAllAdminUsers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    isOrganizer: row.is_organizer,
    isAdmin: row.is_admin ?? false,
    createdAt: row.created_at,
    birthDate: (row as { birth_date?: string | null }).birth_date ?? null,
    interestedTags: (row as { interested_tags?: string[] }).interested_tags ?? [],
  }));
}

export async function adminDeleteEvent(eventId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function adminUpdateEventStatus(
  eventId: string,
  status: EventStatus,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ status }).eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function adminToggleEventFeatured(
  eventId: string,
  featured: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ is_featured: featured }).eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function adminUpdateEvent(
  eventId: string,
  data: {
    title?: string;
    description?: string;
    category?: EventCategory;
    city?: City;
    venueName?: string;
    venueAddress?: string;
    startsAt?: string;
    endsAt?: string;
  },
): Promise<void> {
  const supabase = await createClient();
  const update: Record<string, string | number | boolean | null> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.category !== undefined) update.category = data.category;
  if (data.city !== undefined) update.city = data.city;
  if (data.venueName !== undefined) update.venue_name = data.venueName;
  if (data.venueAddress !== undefined) update.venue_address = data.venueAddress;
  if (data.startsAt !== undefined) update.starts_at = data.startsAt;
  if (data.endsAt !== undefined) update.ends_at = data.endsAt;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from("events").update(update as any).eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function adminToggleUserAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from("profiles").update({ is_admin: isAdmin } as any).eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function getEventAnalytics(eventId: string): Promise<EventAnalytics> {
  const supabase = await createClient();
  const [eventRes, ordersRes, ticketsRes, waitlistRes] = await Promise.all([
    supabase.from("events").select("title").eq("id", eventId).single(),
    supabase.from("orders").select("status, subtotal_paise, commission_paise, convenience_fee_paise, platform_fee_paise, organizer_payout_paise").eq("event_id", eventId),
    supabase.from("tickets").select("status").eq("event_id", eventId),
    supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "WAITING"),
  ]);
  const orders = ordersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const confirmed = orders.filter((o) => o.status === "CONFIRMED");
  const gross = confirmed.reduce((s, o) => s + (o.subtotal_paise ?? 0), 0);
  const commission = confirmed.reduce((s, o) => s + (o.commission_paise ?? 0), 0);
  const convenience = confirmed.reduce((s, o) => s + (o.convenience_fee_paise ?? 0), 0);
  const platformFee = confirmed.reduce((s, o) => s + (o.platform_fee_paise ?? 0), 0);
  const payout = confirmed.reduce((s, o) => s + (o.organizer_payout_paise ?? 0), 0);
  return {
    eventId, eventTitle: eventRes.data?.title ?? "Event",
    totalOrders: orders.length,
    confirmedOrders: confirmed.length,
    pendingOrders: orders.filter((o) => o.status === "PENDING_VERIFICATION").length,
    rejectedOrders: orders.filter((o) => o.status === "REJECTED").length,
    grossRevenuePaise: gross,
    commissionPaise: commission,
    convenienceFeePaise: convenience,
    platformFeePaise: platformFee,
    netPayoutPaise: payout,
    checkIns: tickets.filter((t) => t.status === "USED").length,
    waitlistCount: waitlistRes.count ?? 0,
  };
}

export async function listAllAdminOrders(): Promise<Order[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!rows) return [];

  // Fetch event titles and tier names in one pass each
  const eventIds = [...new Set(rows.map((r) => r.event_id))];
  const tierIds = [...new Set(rows.map((r) => r.tier_id))];
  const [{ data: events }, { data: tiers }] = await Promise.all([
    supabase.from("events").select("id, title").in("id", eventIds),
    supabase.from("ticket_tiers").select("id, name").in("id", tierIds),
  ]);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e.title]));
  const tierMap = Object.fromEntries((tiers ?? []).map((t) => [t.id, t.name]));

  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    eventTitle: eventMap[row.event_id] ?? "Event",
    tierId: row.tier_id,
    tierName: tierMap[row.tier_id] ?? "Ticket",
    userId: row.user_id,
    quantity: row.quantity,
    unitPricePaise: row.unit_price_paise,
    subtotalPaise: row.subtotal_paise,
    platformFeePaise: row.platform_fee_paise,
    totalPaise: row.total_paise,
    feePayer: row.fee_payer,
    status: row.status,
    utrReference: row.utr_reference,
    paymentProofUrl: row.payment_proof_url,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    buyerEmail: row.buyer_email ?? null,
    buyerGender: row.buyer_gender ?? null,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  }));
}

export async function listEventOrders(eventId: string): Promise<Order[]> {
  const supabase = await createClient();
  const [{ data: rows }, { data: eventRow }] = await Promise.all([
    supabase.from("orders").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.from("events").select("title").eq("id", eventId).single(),
  ]);
  if (!rows) return [];
  const title = eventRow?.title ?? "Event";
  const tierIds = [...new Set(rows.map((r) => r.tier_id))];
  const { data: tiers } = await supabase.from("ticket_tiers").select("id, name").in("id", tierIds);
  const tierMap = Object.fromEntries((tiers ?? []).map((t) => [t.id, t.name]));

  return rows.map((row) => ({
    id: row.id,
    eventId,
    eventTitle: title,
    tierId: row.tier_id,
    tierName: tierMap[row.tier_id] ?? "Ticket",
    userId: row.user_id,
    quantity: row.quantity,
    unitPricePaise: row.unit_price_paise,
    subtotalPaise: row.subtotal_paise,
    platformFeePaise: row.platform_fee_paise,
    totalPaise: row.total_paise,
    feePayer: row.fee_payer,
    status: row.status,
    utrReference: row.utr_reference,
    paymentProofUrl: row.payment_proof_url,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    buyerEmail: row.buyer_email ?? null,
    buyerGender: row.buyer_gender ?? null,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  }));
}

export async function listEventTickets(eventId: string): Promise<Ticket[]> {
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
export interface RevenueAnalytics {
  totalGrossPaise: number;
  totalPlatformFeePaise: number;
  totalNetPayoutPaise: number;
  perEvent: {
    eventId: string;
    eventTitle: string;
    organizerName: string;
    confirmedOrders: number;
    grossPaise: number;
    platformFeePaise: number;
    netPayoutPaise: number;
  }[];
}

export async function getRevenueAnalytics(): Promise<RevenueAnalytics> {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("event_id, subtotal_paise, commission_paise, convenience_fee_paise, platform_fee_paise, organizer_payout_paise, status")
    .eq("status", "CONFIRMED")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (!orders || orders.length === 0) {
    return { totalGrossPaise: 0, totalPlatformFeePaise: 0, totalNetPayoutPaise: 0, perEvent: [] };
  }
  const eventIds = [...new Set(orders.map((o) => o.event_id))];
  const [{ data: events }, { data: organizers }] = await Promise.all([
    supabase.from("events").select("id, title, organizer_id").in("id", eventIds),
    supabase.from("organizers").select("id, name"),
  ]);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e]));
  const orgMap = Object.fromEntries((organizers ?? []).map((o) => [o.id, o.name]));

  const perEventMap = new Map<string, { eventId: string; eventTitle: string; organizerName: string; confirmedOrders: number; grossPaise: number; platformFeePaise: number; netPayoutPaise: number }>();
  let totalGross = 0, totalFee = 0, totalPayout = 0;
  for (const o of orders) {
    const evt = eventMap[o.event_id];
    const key = o.event_id;
    const entry = perEventMap.get(key) ?? {
      eventId: o.event_id,
      eventTitle: evt?.title ?? "Event",
      organizerName: evt ? (orgMap[evt.organizer_id] ?? "Organizer") : "Organizer",
      confirmedOrders: 0, grossPaise: 0, platformFeePaise: 0, netPayoutPaise: 0,
    };
    entry.confirmedOrders++;
    entry.grossPaise += o.subtotal_paise ?? 0;
    entry.platformFeePaise += o.platform_fee_paise ?? 0;
    entry.netPayoutPaise += o.organizer_payout_paise ?? 0;
    perEventMap.set(key, entry);
    totalGross += o.subtotal_paise ?? 0;
    totalFee += o.platform_fee_paise ?? 0;
    totalPayout += o.organizer_payout_paise ?? 0;
  }
  return {
    totalGrossPaise: totalGross,
    totalPlatformFeePaise: totalFee,
    totalNetPayoutPaise: totalPayout,
    perEvent: [...perEventMap.values()].sort((a, b) => b.grossPaise - a.grossPaise),
  };
}
