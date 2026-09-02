import "server-only";

import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminEvent,
  AdminStats,
  AdminUser,
  EventAnalytics,
  EventCategory,
  EventStatus,
  Order,
  Ticket,
  City,
} from "@/lib/types";

export async function getAdminStats(): Promise<AdminStats> {
  if (!isSupabaseConfigured()) {
    const store = demoStore();
    return {
      totalEvents: store.events.length,
      activeEvents: store.events.filter((e) => e.status === "PUBLISHED").length,
      totalOrders: store.orders.length,
      pendingOrders: store.orders.filter((o) => o.status === "PENDING_VERIFICATION").length,
      totalRevenuePaise: store.orders
        .filter((o) => o.status === "CONFIRMED")
        .reduce((sum, o) => sum + o.totalPaise, 0),
      activeBoosts: store.boosts.filter((b) => b.status === "ACTIVE").length,
      pendingBoosts: store.boosts.filter((b) => b.status === "PENDING").length,
    };
  }
  const supabase = await createClient();
  const [events, orders, boosts] = await Promise.all([
    supabase.from("events").select("id, status"),
    supabase.from("orders").select("id, status, total_paise"),
    supabase.from("boosts").select("id, status"),
  ]);
  const evts = events.data ?? [];
  const ords = orders.data ?? [];
  const bsts = boosts.data ?? [];
  return {
    totalEvents: evts.length,
    activeEvents: evts.filter((e) => e.status === "PUBLISHED").length,
    totalOrders: ords.length,
    pendingOrders: ords.filter((o) => o.status === "PENDING_VERIFICATION").length,
    totalRevenuePaise: ords.filter((o) => o.status === "CONFIRMED").reduce((s, o) => s + o.total_paise, 0),
    activeBoosts: bsts.filter((b) => b.status === "ACTIVE").length,
    pendingBoosts: bsts.filter((b) => b.status === "PENDING").length,
  };
}

export async function listAllAdminEvents(): Promise<AdminEvent[]> {
  if (!isSupabaseConfigured()) {
    return demoStore().events.map((e) => ({
      id: e.id, title: e.title, category: e.category, city: e.city,
      status: e.status, startsAt: e.startsAt, organizerName: e.organizer.name,
      registrationsCount: e.registrationsCount, isFeatured: e.isFeatured,
    }));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, category, city, status, starts_at, is_featured, registrations_count, organizer_id")
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id, title: row.title,
    category: row.category as EventCategory,
    city: row.city as City,
    status: row.status as EventStatus,
    startsAt: row.starts_at,
    organizerName: "Organizer",
    registrationsCount: row.registrations_count,
    isFeatured: row.is_featured,
  }));
}

export async function listAllAdminUsers(): Promise<AdminUser[]> {
  if (!isSupabaseConfigured()) {
    const store = demoStore();
    // Ensure the current demo user is admin
    return store.users.map((u) => ({
      ...u,
      isAdmin: true, // In demo mode, all users are treated as admin
    }));
  }
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
  }));
}

export async function adminDeleteEvent(eventId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const store = demoStore();
    const idx = store.events.findIndex((e) => e.id === eventId);
    if (idx !== -1) store.events.splice(idx, 1);
    return;
  }
  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", eventId);
}

export async function adminUpdateEventStatus(
  eventId: string,
  status: EventStatus,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const event = demoStore().events.find((e) => e.id === eventId);
    if (event) event.status = status;
    return;
  }
  const supabase = await createClient();
  await supabase.from("events").update({ status }).eq("id", eventId);
}

export async function adminToggleUserAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("profiles").update({ is_admin: isAdmin } as any).eq("id", userId);
}

export async function getEventAnalytics(eventId: string): Promise<EventAnalytics> {
  if (!isSupabaseConfigured()) {
    const store = demoStore();
    const event = store.events.find((e) => e.id === eventId);
    const orders = store.orders.filter((o) => o.eventId === eventId);
    const tickets = store.tickets.filter((t) => t.eventId === eventId);
    const confirmed = orders.filter((o) => o.status === "CONFIRMED");
    const gross = confirmed.reduce((s, o) => s + o.totalPaise, 0);
    const fee = confirmed.reduce((s, o) => s + o.platformFeePaise, 0);
    return {
      eventId, eventTitle: event?.title ?? "Event",
      totalOrders: orders.length,
      confirmedOrders: confirmed.length,
      pendingOrders: orders.filter((o) => o.status === "PENDING_VERIFICATION").length,
      rejectedOrders: orders.filter((o) => o.status === "REJECTED").length,
      grossRevenuePaise: gross, platformFeePaise: fee,
      netPayoutPaise: gross - fee,
      checkIns: tickets.filter((t) => t.status === "USED").length,
      waitlistCount: store.waitlist.filter((w) => w.eventId === eventId).length,
    };
  }
  const supabase = await createClient();
  const [eventRes, ordersRes, ticketsRes, waitlistRes] = await Promise.all([
    supabase.from("events").select("title").eq("id", eventId).single(),
    supabase.from("orders").select("status, total_paise, platform_fee_paise").eq("event_id", eventId),
    supabase.from("tickets").select("status").eq("event_id", eventId),
    supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "WAITING"),
  ]);
  const orders = ordersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const confirmed = orders.filter((o) => o.status === "CONFIRMED");
  const gross = confirmed.reduce((s, o) => s + o.total_paise, 0);
  const fee = confirmed.reduce((s, o) => s + o.platform_fee_paise, 0);
  return {
    eventId, eventTitle: eventRes.data?.title ?? "Event",
    totalOrders: orders.length,
    confirmedOrders: confirmed.length,
    pendingOrders: orders.filter((o) => o.status === "PENDING_VERIFICATION").length,
    rejectedOrders: orders.filter((o) => o.status === "REJECTED").length,
    grossRevenuePaise: gross, platformFeePaise: fee,
    netPayoutPaise: gross - fee,
    checkIns: tickets.filter((t) => t.status === "USED").length,
    waitlistCount: waitlistRes.count ?? 0,
  };
}

export async function listAllAdminOrders(): Promise<Order[]> {
  if (!isSupabaseConfigured()) {
    return demoStore().orders;
  }
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
  if (!isSupabaseConfigured()) {
    return demoStore().orders.filter((o) => o.eventId === eventId);
  }
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
  if (!isSupabaseConfigured()) {
    return demoStore().tickets.filter((t) => t.eventId === eventId);
  }
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
