import "server-only";

import { createClient } from "../../shared/auth/server";
import { createServiceClient } from "../../shared/auth/service";
import { getCurrentUser } from "../../shared/auth/auth";
import type { EventAnalytics } from "../../shared";

type DailyMetricRow = {
  day: string;
  signups: number;
  new_organizers: number;
  dau: number;
  orders_created: number;
  orders_confirmed: number;
  gross_paise: number;
  buyer_paid_paise: number;
  commission_paise: number;
  convenience_fee_paise: number;
  platform_fee_paise: number;
  organizer_payout_paise: number;
};

type TotalsRow = {
  total_payments: number;
  confirmed_payments: number;
  total_volume_paise: number;
  avg_order_value_paise: number;
  active_users: number;
  returning_users: number;
  non_returning_users: number;
  mau: number;
  payment_methods: { method: string; count: number; volumePaise: number }[];
};

type OrganizerRollupRow = {
  organizer_id: string;
  event_count: number;
  confirmed_revenue_paise: number;
};

type EventRollupRow = {
  event_id: string;
  organizer_id: string;
  confirmed_orders: number;
  gross_paise: number;
  buyer_paid_paise: number;
  commission_paise: number;
  convenience_fee_paise: number;
  platform_fee_paise: number;
  organizer_payout_paise: number;
};

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

/** Last n days of rollups, padded with zeros for missing days. */
function padDaily(
  rows: DailyMetricRow[],
  days: number,
): DailyMetricRow[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const now = new Date();
  const out: DailyMetricRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    out.push(
      byDay.get(day) ?? {
        day, signups: 0, new_organizers: 0, dau: 0,
        orders_created: 0, orders_confirmed: 0,
        gross_paise: 0, buyer_paid_paise: 0, commission_paise: 0,
        convenience_fee_paise: 0, platform_fee_paise: 0, organizer_payout_paise: 0,
      },
    );
  }
  return out;
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
  const service = createServiceClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { count: totalUsers },
    { count: organizersCount },
    { count: newUsersThisMonth },
    { count: newUsersToday },
    { data: totalsRow },
    { data: dailyRows },
    { data: todayOrders },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("organizers").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", todayStart),
    service.from("analytics_totals_v").select("*").eq("id", 1).maybeSingle(),
    service.from("analytics_daily_metrics_v").select("*").gte("day", thirtyDaysAgo),
    // Live partial for today (rollup refreshes hourly)
    supabase.from("orders").select("user_id").gte("created_at", todayStart),
  ]);

  const totals = (totalsRow ?? {}) as Partial<TotalsRow>;
  const daily = padDaily((dailyRows ?? []) as DailyMetricRow[], 30);

  // DAU: merge the live today-bucket with the rollup (whichever is fresher).
  const liveDau = new Set((todayOrders ?? []).map((o) => o.user_id)).size;
  const rollupTodayDau = daily[daily.length - 1]?.dau ?? 0;

  return {
    totalUsers: totalUsers ?? 0,
    activeUsers: totals.active_users ?? 0,
    organizersCount: organizersCount ?? 0,
    newUsersThisMonth: newUsersThisMonth ?? 0,
    newUsersToday: newUsersToday ?? 0,
    dau: Math.max(liveDau, rollupTodayDau),
    mau: totals.mau ?? 0,
    returningUsers: totals.returning_users ?? 0,
    nonReturningUsers: totals.non_returning_users ?? 0,
    dailySignups: daily.map((d) => ({ date: d.day, count: d.signups })),
    dailyActive: daily.map((d) => ({ date: d.day, count: d.dau })),
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
  const service = createServiceClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [{ data: totalsRow }, { data: dailyRows }] = await Promise.all([
    service.from("analytics_totals_v").select("*").eq("id", 1).maybeSingle(),
    service.from("analytics_daily_metrics_v").select("*").gte("day", thirtyDaysAgo),
  ]);

  const totals = (totalsRow ?? {}) as Partial<TotalsRow>;
  const daily = padDaily((dailyRows ?? []) as DailyMetricRow[], 30);

  return {
    totalPayments: totals.total_payments ?? 0,
    confirmedPayments: totals.confirmed_payments ?? 0,
    totalVolumePaise: totals.total_volume_paise ?? 0,
    avgOrderValuePaise: totals.avg_order_value_paise ?? 0,
    dailyRevenue: daily.map((d) => ({
      date: d.day,
      revenuePaise: d.buyer_paid_paise,
      orderCount: d.orders_confirmed,
    })),
    paymentMethods: (totals.payment_methods ?? []).map((m) => ({
      method: m.method,
      count: m.count,
      volumePaise: m.volumePaise,
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
  const service = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { count: totalOrganizers },
    { count: verifiedOrganizers },
    { count: totalEvents },
    { data: dailyRows },
    { data: rollup },
  ] = await Promise.all([
    supabase.from("organizers").select("*", { count: "exact", head: true }),
    supabase.from("organizers").select("*", { count: "exact", head: true }).eq("verified", true),
    supabase.from("events").select("*", { count: "exact", head: true }),
    service.from("analytics_daily_metrics_v").select("*").gte("day", thirtyDaysAgo),
    service.from("analytics_organizer_rollup_v").select("*").order("confirmed_revenue_paise", { ascending: false }).limit(10),
  ]);

  const daily = padDaily((dailyRows ?? []) as DailyMetricRow[], 30);
  const dailyNewOrganizers = daily.map((d) => ({ date: d.day, count: d.new_organizers }));

  const rollups = (rollup ?? []) as OrganizerRollupRow[];
  const orgIds = rollups.map((r) => r.organizer_id);
  const { data: orgRows } = orgIds.length
    ? await supabase.from("organizers").select("id, name").in("id", orgIds)
    : { data: [] as { id: string; name: string }[] };
  const orgNameMap = Object.fromEntries((orgRows ?? []).map((o) => [o.id, o.name]));

  const topOrganizers = rollups.map((r) => ({
    organizerId: r.organizer_id,
    name: orgNameMap[r.organizer_id] ?? "Unknown",
    eventCount: r.event_count,
    revenuePaise: r.confirmed_revenue_paise,
  }));

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
  const service = createServiceClient();

  const { data: rollups } = await service.from("analytics_event_rollup_v").select("*");
  const rows = (rollups ?? []) as EventRollupRow[];
  if (rows.length === 0) {
    return {
      totalBuyerPaidPaise: 0, totalGrossPaise: 0, totalCommissionPaise: 0,
      totalConvenienceFeePaise: 0, totalPlatformFeePaise: 0, totalNetPayoutPaise: 0,
      perEvent: [],
    };
  }

  const eventIds = rows.map((r) => r.event_id);
  const orgIds = [...new Set(rows.map((r) => r.organizer_id))];
  const [{ data: events }, { data: organizers }] = await Promise.all([
    supabase.from("events").select("id, title").in("id", eventIds),
    supabase.from("organizers").select("id, name").in("id", orgIds),
  ]);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e]));
  const orgMap = Object.fromEntries((organizers ?? []).map((o) => [o.id, o.name]));

  let totalBuyerPaid = 0, totalGross = 0, totalCommission = 0, totalConvenience = 0, totalFee = 0, totalPayout = 0;
  const perEvent = rows.map((r) => {
    const evt = eventMap[r.event_id];
    totalBuyerPaid += r.buyer_paid_paise;
    totalGross += r.gross_paise;
    totalCommission += r.commission_paise;
    totalConvenience += r.convenience_fee_paise;
    totalFee += r.platform_fee_paise;
    totalPayout += r.organizer_payout_paise;
    return {
      eventId: r.event_id,
      eventTitle: evt?.title ?? "Event",
      organizerName: orgMap[r.organizer_id] ?? "Organizer",
      confirmedOrders: r.confirmed_orders,
      buyerPaidPaise: r.buyer_paid_paise,
      grossPaise: r.gross_paise,
      commissionPaise: r.commission_paise,
      convenienceFeePaise: r.convenience_fee_paise,
      platformFeePaise: r.platform_fee_paise,
      netPayoutPaise: r.organizer_payout_paise,
    };
  }).sort((a, b) => b.grossPaise - a.grossPaise);

  return {
    totalBuyerPaidPaise: totalBuyerPaid,
    totalGrossPaise: totalGross,
    totalCommissionPaise: totalCommission,
    totalConvenienceFeePaise: totalConvenience,
    totalPlatformFeePaise: totalFee,
    totalNetPayoutPaise: totalPayout,
    perEvent,
  };
}
