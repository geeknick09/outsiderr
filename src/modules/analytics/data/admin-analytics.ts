import "server-only";

import { createClient } from "../../shared/auth/server";
import { getCurrentUser } from "../../shared/auth/auth";
import type { EventAnalytics, PricingMode, Ticket } from "../../shared";

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

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;       // users who have at least 1 confirmed order
  organizersCount: number;
  newUsersThisMonth: number;
  newUsersToday: number;
  // DAU / MAU are approximated from order activity since we don't have a separate sessions table
  dau: number;               // distinct users with activity today
  mau: number;               // distinct users with activity in last 30 days
  returningUsers: number;    // users with 2+ orders
  nonReturningUsers: number; // users with exactly 1 order
  // Daily signups for the last 30 days (for chart)
  dailySignups: { date: string; count: number }[];
  // Daily active users for the last 30 days (for chart)
  dailyActive: { date: string; count: number }[];
}

export async function getUserAnalytics(): Promise<UserAnalytics> {
  await requireAdminUser();
  const supabase = await createClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalUsers },
    { count: organizersCount },
    { count: newUsersThisMonth },
    { count: newUsersToday },
    { data: orders },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("organizers").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", todayStart),
    supabase.from("orders").select("user_id, created_at, status").order("created_at", { ascending: false }),
  ]);

  const ords = orders ?? [];

  // Active users = users with at least 1 confirmed order
  const confirmedOrders = ords.filter((o) => o.status === "CONFIRMED");
  const activeUserIds = new Set(confirmedOrders.map((o) => o.user_id));

  // DAU = distinct users with any order activity today
  const dauIds = new Set(ords.filter((o) => o.created_at >= todayStart).map((o) => o.user_id));

  // MAU = distinct users with any order activity in last 30 days
  const mauIds = new Set(ords.filter((o) => o.created_at >= thirtyDaysAgo).map((o) => o.user_id));

  // Returning vs non-returning: users with 2+ confirmed orders vs 1
  const orderCountByUser = new Map<string, number>();
  for (const o of confirmedOrders) {
    orderCountByUser.set(o.user_id, (orderCountByUser.get(o.user_id) ?? 0) + 1);
  }
  let returningUsers = 0;
  let nonReturningUsers = 0;
  for (const count of orderCountByUser.values()) {
    if (count >= 2) returningUsers++;
    else nonReturningUsers++;
  }

  // Daily signups for last 30 days
  const { data: recentProfiles } = await supabase
    .from("profiles")
    .select("created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  const signupMap = new Map<string, number>();
  for (const p of recentProfiles ?? []) {
    const day = p.created_at.slice(0, 10);
    signupMap.set(day, (signupMap.get(day) ?? 0) + 1);
  }

  const dailySignups: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    dailySignups.push({ date: day, count: signupMap.get(day) ?? 0 });
  }

  // Daily active users for last 30 days
  const activeMap = new Map<string, Set<string>>();
  for (const o of ords) {
    const day = o.created_at.slice(0, 10);
    if (!activeMap.has(day)) activeMap.set(day, new Set());
    activeMap.get(day)!.add(o.user_id);
  }

  const dailyActive: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    dailyActive.push({ date: day, count: activeMap.get(day)?.size ?? 0 });
  }

  return {
    totalUsers: totalUsers ?? 0,
    activeUsers: activeUserIds.size,
    organizersCount: organizersCount ?? 0,
    newUsersThisMonth: newUsersThisMonth ?? 0,
    newUsersToday: newUsersToday ?? 0,
    dau: dauIds.size,
    mau: mauIds.size,
    returningUsers,
    nonReturningUsers,
    dailySignups,
    dailyActive,
  };
}

// ---------------------------------------------------------------- payment analytics
export interface PaymentAnalytics {
  totalPayments: number;
  confirmedPayments: number;
  totalVolumePaise: number;
  avgOrderValuePaise: number;
  // Daily revenue for last 30 days
  dailyRevenue: { date: string; revenuePaise: number; orderCount: number }[];
  // Payment method breakdown
  paymentMethods: { method: string; count: number; volumePaise: number }[];
}

export async function getPaymentAnalytics(): Promise<PaymentAnalytics> {
  await requireAdminUser();
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("status, total_paise, created_at, payment_method")
    .order("created_at", { ascending: false });

  const ords = orders ?? [];
  const confirmed = ords.filter((o) => o.status === "CONFIRMED");
  const totalVolumePaise = confirmed.reduce((s, o) => s + (o.total_paise ?? 0), 0);

  // Daily revenue for last 30 days
  const revenueMap = new Map<string, { revenuePaise: number; orderCount: number }>();
  for (const o of confirmed) {
    const day = o.created_at.slice(0, 10);
    const existing = revenueMap.get(day) ?? { revenuePaise: 0, orderCount: 0 };
    existing.revenuePaise += o.total_paise ?? 0;
    existing.orderCount += 1;
    revenueMap.set(day, existing);
  }

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

  // Payment method breakdown
  const methodMap = new Map<string, { count: number; volumePaise: number }>();
  for (const o of confirmed) {
    const method = o.payment_method ?? "unknown";
    const existing = methodMap.get(method) ?? { count: 0, volumePaise: 0 };
    existing.count += 1;
    existing.volumePaise += o.total_paise ?? 0;
    methodMap.set(method, existing);
  }

  return {
    totalPayments: ords.length,
    confirmedPayments: confirmed.length,
    totalVolumePaise,
    avgOrderValuePaise: confirmed.length > 0 ? Math.round(totalVolumePaise / confirmed.length) : 0,
    dailyRevenue,
    paymentMethods: Array.from(methodMap.entries()).map(([method, v]) => ({
      method,
      count: v.count,
      volumePaise: v.volumePaise,
    })),
  };
}

// ---------------------------------------------------------------- organizer analytics
export interface OrganizerAnalytics {
  totalOrganizers: number;
  verifiedOrganizers: number;
  totalEvents: number;
  // Daily new organizers for last 30 days
  dailyNewOrganizers: { date: string; count: number }[];
  // Top organizers by revenue
  topOrganizers: { organizerId: string; name: string; eventCount: number; revenuePaise: number }[];
}

export async function getOrganizerAnalytics(): Promise<OrganizerAnalytics> {
  await requireAdminUser();
  const supabase = await createClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalOrganizers },
    { count: verifiedOrganizers },
    { count: totalEvents },
    { data: organizers },
    { data: events },
    { data: orders },
  ] = await Promise.all([
    supabase.from("organizers").select("*", { count: "exact", head: true }),
    supabase.from("organizers").select("*", { count: "exact", head: true }).eq("verified", true),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("organizers").select("id, name, created_at").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: true }),
    supabase.from("events").select("id, organizer_id"),
    supabase.from("orders").select("event_id, total_paise, subtotal_paise, status").eq("status", "CONFIRMED"),
  ]);

  // Daily new organizers
  const orgMap = new Map<string, number>();
  for (const o of organizers ?? []) {
    const day = o.created_at.slice(0, 10);
    orgMap.set(day, (orgMap.get(day) ?? 0) + 1);
  }

  const now = new Date();
  const dailyNewOrganizers: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    dailyNewOrganizers.push({ date: day, count: orgMap.get(day) ?? 0 });
  }

  // Top organizers by revenue
  const eventToOrg = new Map<string, string>();
  for (const e of events ?? []) {
    eventToOrg.set(e.id, e.organizer_id);
  }

  const orgRevenue = new Map<string, number>();
  const orgEventCount = new Map<string, Set<string>>();
  for (const o of orders ?? []) {
    const orgId = eventToOrg.get(o.event_id);
    if (!orgId) continue;
    orgRevenue.set(orgId, (orgRevenue.get(orgId) ?? 0) + (o.subtotal_paise ?? 0));
    if (!orgEventCount.has(orgId)) orgEventCount.set(orgId, new Set());
    orgEventCount.get(orgId)!.add(o.event_id);
  }

  const orgNameMap = Object.fromEntries((organizers ?? []).map((o) => [o.id, o.name]));
  // Also fetch all organizers for name lookup
  const { data: allOrgs } = await supabase.from("organizers").select("id, name");
  for (const o of allOrgs ?? []) orgNameMap[o.id] = o.name;

  const topOrganizers = Array.from(orgRevenue.entries())
    .map(([organizerId, revenuePaise]) => ({
      organizerId,
      name: orgNameMap[organizerId] ?? "Unknown",
      eventCount: orgEventCount.get(organizerId)?.size ?? 0,
      revenuePaise,
    }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise)
    .slice(0, 10);

  return {
    totalOrganizers: totalOrganizers ?? 0,
    verifiedOrganizers: verifiedOrganizers ?? 0,
    totalEvents: totalEvents ?? 0,
    dailyNewOrganizers,
    topOrganizers,
  };
}


export async function getEventAnalytics(eventId: string): Promise<EventAnalytics> {
  // No admin guard here — called from getOrganizerEventAnalytics which checks ownership
  const supabase = await createClient();
  const [eventRes, ordersRes, ticketsRes, waitlistRes, tiersRes] = await Promise.all([
    supabase.from("events").select("title").eq("id", eventId).single(),
    supabase.from("orders").select("status, subtotal_paise, commission_paise, convenience_fee_paise, platform_fee_paise, organizer_payout_paise").eq("event_id", eventId),
    supabase.from("tickets").select("status").eq("event_id", eventId),
    supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "WAITING"),
    supabase.from("ticket_tiers").select("id, name, tier_type, price_paise, quantity, quantity_sold, phase_opens_at, phase_closes_at").eq("event_id", eventId).order("sort_order"),
  ]);
  const orders = ordersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const tiers = tiersRes.data ?? [];
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
    tierBreakdown: tiers.map((t) => ({
      tierId: t.id,
      tierName: t.name,
      tierType: t.tier_type ?? "NAMED",
      pricePaise: t.price_paise,
      quantity: t.quantity,
      quantitySold: t.quantity_sold,
      quantityLeft: t.quantity - t.quantity_sold,
      phaseOpensAt: t.phase_opens_at,
      phaseClosesAt: t.phase_closes_at,
    })),
  };
}


export interface RevenueAnalytics {
  totalBuyerPaidPaise: number;       // total collections from buyers
  totalGrossPaise: number;           // ticket face value subtotal
  totalCommissionPaise: number;      // commission from organizers
  totalConvenienceFeePaise: number;  // convenience fee from buyers
  totalPlatformFeePaise: number;     // total gross platform revenue (commission + convenience)
  totalNetPayoutPaise: number;       // total net payable to organizers
  perEvent: {
    eventId: string;
    eventTitle: string;
    organizerName: string;
    confirmedOrders: number;
    buyerPaidPaise: number;
    grossPaise: number;
    commissionPaise: number;
    convenienceFeePaise: number;
    platformFeePaise: number;
    netPayoutPaise: number;
  }[];
}

export async function getRevenueAnalytics(): Promise<RevenueAnalytics> {
  await requireAdminUser();
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("event_id, total_paise, subtotal_paise, commission_paise, convenience_fee_paise, platform_fee_paise, organizer_payout_paise, status")
    .eq("status", "CONFIRMED")
    .order("created_at", { ascending: false });
  if (!orders || orders.length === 0) {
    return {
      totalBuyerPaidPaise: 0,
      totalGrossPaise: 0,
      totalCommissionPaise: 0,
      totalConvenienceFeePaise: 0,
      totalPlatformFeePaise: 0,
      totalNetPayoutPaise: 0,
      perEvent: [],
    };
  }
  const eventIds = [...new Set(orders.map((o) => o.event_id))];
  const [{ data: events }, { data: organizers }] = await Promise.all([
    supabase.from("events").select("id, title, organizer_id").in("id", eventIds),
    supabase.from("organizers").select("id, name"),
  ]);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e]));
  const orgMap = Object.fromEntries((organizers ?? []).map((o) => [o.id, o.name]));

  const perEventMap = new Map<string, {
    eventId: string;
    eventTitle: string;
    organizerName: string;
    confirmedOrders: number;
    buyerPaidPaise: number;
    grossPaise: number;
    commissionPaise: number;
    convenienceFeePaise: number;
    platformFeePaise: number;
    netPayoutPaise: number;
  }>();

  let totalBuyerPaid = 0, totalGross = 0, totalCommission = 0, totalConvenience = 0, totalFee = 0, totalPayout = 0;
  for (const o of orders) {
    const evt = eventMap[o.event_id];
    const key = o.event_id;
    const entry = perEventMap.get(key) ?? {
      eventId: o.event_id,
      eventTitle: evt?.title ?? "Event",
      organizerName: evt ? (orgMap[evt.organizer_id] ?? "Organizer") : "Organizer",
      confirmedOrders: 0,
      buyerPaidPaise: 0,
      grossPaise: 0,
      commissionPaise: 0,
      convenienceFeePaise: 0,
      platformFeePaise: 0,
      netPayoutPaise: 0,
    };
    entry.confirmedOrders++;
    entry.buyerPaidPaise += o.total_paise ?? 0;
    entry.grossPaise += o.subtotal_paise ?? 0;
    entry.commissionPaise += o.commission_paise ?? 0;
    entry.convenienceFeePaise += o.convenience_fee_paise ?? 0;
    entry.platformFeePaise += o.platform_fee_paise ?? 0;
    entry.netPayoutPaise += o.organizer_payout_paise ?? 0;
    perEventMap.set(key, entry);

    totalBuyerPaid += o.total_paise ?? 0;
    totalGross += o.subtotal_paise ?? 0;
    totalCommission += o.commission_paise ?? 0;
    totalConvenience += o.convenience_fee_paise ?? 0;
    totalFee += o.platform_fee_paise ?? 0;
    totalPayout += o.organizer_payout_paise ?? 0;
  }
  return {
    totalBuyerPaidPaise: totalBuyerPaid,
    totalGrossPaise: totalGross,
    totalCommissionPaise: totalCommission,
    totalConvenienceFeePaise: totalConvenience,
    totalPlatformFeePaise: totalFee,
    totalNetPayoutPaise: totalPayout,
    perEvent: [...perEventMap.values()].sort((a, b) => b.grossPaise - a.grossPaise),
  };
}
