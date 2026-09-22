import "server-only";

import { createClient } from "../../shared/auth/server";
import { createServiceClient } from "../../shared/auth/service";
import { getCurrentUser } from "../../shared/auth/auth";
import type { AdminEvent, AdminStats, AdminUser, EventCategory, EventStatus, Order, City, PricingMode } from "../../shared";

async function requireAdminUser(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required.");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Admin access required.");
}

export async function getAdminStats(): Promise<AdminStats> {
  await requireAdminUser();
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
    confirmedOrders: confirmed.length,
    pendingOrders: ords.filter((o) => o.status === "PENDING_VERIFICATION").length,
    totalRevenuePaise: confirmed.reduce((s, o) => s + (o.total_paise ?? 0), 0),
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
  await requireAdminUser();
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
  await requireAdminUser();
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

// ---------------------------------------------------------------- user analytics

export async function adminDeleteEvent(eventId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function adminUpdateEventStatus(
  eventId: string,
  status: EventStatus,
): Promise<void> {
  // `status` is a privileged column — transitions go through the RPC
  // (admin authz is verified inside).
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_status", {
    p_event_id: eventId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function adminToggleEventFeatured(
  eventId: string,
  featured: boolean,
): Promise<void> {
  // is_featured is a privileged column (revoked from authenticated UPDATE) —
  // admin is verified upstream; write via service role.
  const supabase = createServiceClient();
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
  // is_admin is a privileged column — admin verified upstream.
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from("profiles").update({ is_admin: isAdmin } as any).eq("id", userId);
  if (error) throw new Error(error.message);
}


export async function listAllAdminOrders(): Promise<Order[]> {
  await requireAdminUser();
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
    commissionPaise: row.commission_paise ?? 0,
    convenienceFeePaise: row.convenience_fee_paise ?? 0,
    organizerPayoutPaise: row.organizer_payout_paise ?? 0,
    totalPaise: row.total_paise,
    feePayer: row.fee_payer,
    status: row.status,
    utrReference: row.utr_reference,
    paymentProofUrl: row.payment_proof_url,
    razorpayOrderId: row.razorpay_order_id ?? null,
    razorpayPaymentId: row.razorpay_payment_id ?? null,
    paymentMethod: row.payment_method ?? null,
    invoiceNumber: row.invoice_number ?? null,
    reservedAt: row.reserved_at ?? null,
    reservationExpiresAt: row.reservation_expires_at ?? null,
    confirmedAt: row.confirmed_at ?? null,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    buyerEmail: row.buyer_email ?? null,
    buyerGender: row.buyer_gender ?? null,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    orderSource: row.order_source ?? null,
    isBoxOffice: (row as { is_box_office?: boolean }).is_box_office ?? false,
  }));
}

