import "server-only";

import { createServiceClient } from "../../shared/auth/service";
import { requireAdminUser } from "./admin";

export interface OverviewFilter {
  city?: string;    // event/community city code, e.g. "KOLKATA"
  from?: string;    // ISO date - events by starts_at, orders/profiles by created_at
  to?: string;      // ISO date (inclusive end-of-day handled by caller)
}

export type DrilldownKind =
  | "events" | "orders" | "boosts" | "users" | "new_users"
  | "creators" | "communities" | "admins" | "visitors_no_book";

export interface OverviewStats {
  totalEvents: number;
  activeEvents: number;
  confirmedOrders: number;
  grossRevenuePaise: number;
  totalRevenuePaise: number;
  totalCommissionPaise: number;
  totalConvenienceFeePaise: number;
  totalOrganizerPayoutPaise: number;
  totalPlatformFeePaise: number;
  activeBoosts: number;
  totalCreators: number;
  totalCommunities: number;
  totalUsers: number;
  totalAdmins: number;
  newUsers: number;
  visitorsNoBooking: number;
}

function eventQuery(service: ReturnType<typeof createServiceClient>, f: OverviewFilter) {
  let q = service.from("events").select("id, city, status, starts_at, created_at, title, organizer_id");
  if (f.city) q = q.eq("city", f.city);
  if (f.from) q = q.gte("starts_at", `${f.from}T00:00:00Z`);
  if (f.to) q = q.lte("starts_at", `${f.to}T23:59:59Z`);
  return q;
}

/** Filtered overview counts for the admin dashboard. */
export async function getOverviewStats(f: OverviewFilter = {}): Promise<OverviewStats> {
  await requireAdminUser();
  const service = createServiceClient();

  const { data: events } = await eventQuery(service, f);
  const evIds = new Set((events ?? []).map((e) => e.id));
  const evCity = new Map((events ?? []).map((e) => [e.id, e.city]));

  let ordersQ = service
    .from("orders")
    .select("id, event_id, status, total_paise, subtotal_paise, commission_paise, convenience_fee_paise, organizer_payout_paise, platform_fee_paise, created_at, user_id");
  if (f.from) ordersQ = ordersQ.gte("created_at", `${f.from}T00:00:00Z`);
  if (f.to) ordersQ = ordersQ.lte("created_at", `${f.to}T23:59:59Z`);
  const { data: orderRows } = await ordersQ;
  // City filter applies via the order's event city.
  const ords = (orderRows ?? []).filter((o) => !f.city || evCity.get(o.event_id) === f.city);

  const confirmed = ords.filter((o) => o.status === "CONFIRMED");

  const [bsts, hbsts, creators, commsQ, usersQ, adminsQ, views] = await Promise.all([
    service.from("boosts").select("id, event_id, status"),
    service.from("hero_boosts").select("id, event_id, status"),
    service.from("organizers").select("id, owner_id", { count: "exact" }),
    (() => {
      let q = service.from("communities").select("id, city", { count: "exact" });
      if (f.city) q = q.eq("city", f.city);
      return q;
    })(),
    (() => {
      let q = service.from("profiles").select("id, created_at", { count: "exact" });
      if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
      if (f.to) q = q.lte("created_at", `${f.to}T23:59:59Z`);
      return q;
    })(),
    service.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true),
    (() => {
      let q = service.from("page_views").select("user_id, entity_id, entity_type");
      if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
      if (f.to) q = q.lte("created_at", `${f.to}T23:59:59Z`);
      return q;
    })(),
  ]);

  const activeBoosts =
    (bsts.data ?? []).filter((b) => b.status === "ACTIVE" && (!f.city || evCity.get(b.event_id) === f.city)).length +
    (hbsts.data ?? []).filter((b) => b.status === "ACTIVE" && (!f.city || evCity.get(b.event_id) === f.city)).length;

  // Visitors who viewed a page but never confirmed an order.
  const buyers = new Set(confirmed.map((o) => o.user_id));
  const viewers = new Set(
    (views.data ?? [])
      .filter((v) => !f.city || v.entity_type !== "EVENT" || evCity.get(v.entity_id) === f.city)
      .map((v) => v.user_id),
  );
  let noBook = 0;
  for (const uid of viewers) if (!buyers.has(uid)) noBook++;

  const rangeStart = f.from ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const newUsers = (usersQ.data ?? []).filter((u) => u.created_at >= `${rangeStart}T00:00:00Z`).length;

  return {
    totalEvents: evIds.size,
    activeEvents: (events ?? []).filter((e) => e.status === "PUBLISHED").length,
    confirmedOrders: confirmed.length,
    grossRevenuePaise: confirmed.reduce((s, o) => s + (o.subtotal_paise ?? 0), 0),
    totalRevenuePaise: confirmed.reduce((s, o) => s + (o.total_paise ?? 0), 0),
    totalCommissionPaise: confirmed.reduce((s, o) => s + (o.commission_paise ?? 0), 0),
    totalConvenienceFeePaise: confirmed.reduce((s, o) => s + (o.convenience_fee_paise ?? 0), 0),
    totalOrganizerPayoutPaise: confirmed.reduce((s, o) => s + (o.organizer_payout_paise ?? 0), 0),
    totalPlatformFeePaise: confirmed.reduce((s, o) => s + (o.platform_fee_paise ?? 0), 0),
    activeBoosts,
    totalCreators: creators.count ?? 0,
    totalCommunities: commsQ.count ?? 0,
    totalUsers: usersQ.count ?? 0,
    totalAdmins: adminsQ.count ?? 0,
    newUsers,
    visitorsNoBooking: noBook,
  };
}

/** Drill-down rows for a stat card - powers the modal table + CSV export. */
export async function getOverviewDrilldown(
  kind: DrilldownKind,
  f: OverviewFilter = {},
): Promise<{ columns: string[]; rows: string[][] }> {
  await requireAdminUser();
  const service = createServiceClient();

  switch (kind) {
    case "events": {
      const { data } = await eventQuery(service, f).order("starts_at", { ascending: false }).limit(500);
      const orgIds = [...new Set((data ?? []).map((e) => e.organizer_id))];
      const { data: orgs } = orgIds.length
        ? await service.from("organizers").select("id, name").in("id", orgIds)
        : { data: [] };
      const orgMap = new Map((orgs ?? []).map((o) => [o.id, o.name]));
      return {
        columns: ["Title", "Organizer", "City", "Status", "Starts at"],
        rows: (data ?? []).map((e) => [e.title, orgMap.get(e.organizer_id) ?? "-", e.city, e.status, e.starts_at.slice(0, 16).replace("T", " ")]),
      };
    }
    case "orders": {
      let q = service
        .from("orders")
        .select("id, event_id, user_id, status, total_paise, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
      if (f.to) q = q.lte("created_at", `${f.to}T23:59:59Z`);
      const { data } = await q;
      const { data: evs } = await eventQuery(service, f);
      const evMap = new Map((evs ?? []).map((e) => [e.id, e]));
      const rows = (data ?? [])
        .filter((o) => !f.city || evMap.get(o.event_id)?.city === f.city)
        .map((o) => [o.id.slice(0, 8), evMap.get(o.event_id)?.title ?? "-", o.status, `₹${((o.total_paise ?? 0) / 100).toFixed(0)}`, o.created_at.slice(0, 16).replace("T", " ")]);
      return { columns: ["Order", "Event", "Status", "Amount", "Created"], rows };
    }
    case "boosts": {
      const [{ data: slot }, { data: hero }] = await Promise.all([
        service.from("boosts").select("id, event_id, slot, amount_paid_paise, status, starts_at, ends_at, placement").order("created_at", { ascending: false }).limit(200),
        service.from("hero_boosts").select("id, event_id, amount_paise, status, started_at, expires_at, placement").order("created_at", { ascending: false }).limit(200),
      ]);
      const { data: evs } = await eventQuery(service, f);
      const evMap = new Map((evs ?? []).map((e) => [e.id, e]));
      // When a city filter is set, eventQuery already dropped other cities -
      // so an event missing from the map means "not in this city" (or deleted).
      const visible = (eventId: string) => !f.city || evMap.has(eventId);
      const title = (eventId: string) => evMap.get(eventId)?.title ?? "-";
      const rows = [
        ...(slot ?? [])
          .filter((b) => visible(b.event_id))
          .map((b) => [`Slot #${b.slot}`, title(b.event_id), b.status, `₹${((b.amount_paid_paise ?? 0) / 100).toFixed(0)}`, b.placement ?? "HOME", `${(b.starts_at ?? "").slice(0, 10)} → ${(b.ends_at ?? "").slice(0, 10)}`]),
        ...(hero ?? [])
          .filter((b) => visible(b.event_id))
          .map((b) => ["Feature", title(b.event_id), b.status, `₹${((b.amount_paise ?? 0) / 100).toFixed(0)}`, b.placement ?? "HOME", `${(b.started_at ?? "-").slice(0, 10)} → ${(b.expires_at ?? "-").slice(0, 10)}`]),
      ];
      return { columns: ["Type", "Event", "Status", "Amount", "Placement", "Window"], rows };
    }
    case "users":
    case "new_users": {
      let q = service.from("profiles").select("full_name, email, phone, created_at").order("created_at", { ascending: false }).limit(500);
      if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
      if (f.to) q = q.lte("created_at", `${f.to}T23:59:59Z`);
      if (kind === "new_users" && !f.from) {
        q = service.from("profiles").select("full_name, email, phone, created_at")
          .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString())
          .order("created_at", { ascending: false }).limit(500);
      }
      const { data } = await q;
      return {
        columns: ["Name", "Email", "Phone", "Joined"],
        rows: (data ?? []).map((u) => [u.full_name ?? "-", u.email ?? "-", u.phone ?? "-", u.created_at.slice(0, 10)]),
      };
    }
    case "creators": {
      const { data: orgs } = await service.from("organizers").select("id, name, kyc_status, verified, created_at, owner_id").order("created_at", { ascending: false }).limit(500);
      const { data: evs } = await eventQuery(service, f);
      const evCount = new Map<string, number>();
      const evCity = new Map<string, string>();
      for (const e of evs ?? []) {
        evCount.set(e.organizer_id, (evCount.get(e.organizer_id) ?? 0) + 1);
        evCity.set(e.organizer_id, e.city);
      }
      const ownerIds = (orgs ?? []).map((o) => o.owner_id);
      const { data: owners } = ownerIds.length
        ? await service.from("profiles").select("id, email").in("id", ownerIds)
        : { data: [] };
      const emailMap = new Map((owners ?? []).map((p) => [p.id, p.email]));
      return {
        columns: ["Creator", "Email", "City", "KYC", "Events", "Joined"],
        rows: (orgs ?? []).map((o) => [o.name, emailMap.get(o.owner_id) ?? "-", evCity.get(o.id) ?? "-", o.kyc_status ?? "-", String(evCount.get(o.id) ?? 0), o.created_at.slice(0, 10)]),
      };
    }
    case "communities": {
      let q = service.from("communities").select("name, city, category, membership_type, member_count, created_at").order("created_at", { ascending: false }).limit(500);
      if (f.city) q = q.eq("city", f.city);
      const { data } = await q;
      return {
        columns: ["Community", "City", "Category", "Type", "Members", "Created"],
        rows: (data ?? []).map((c) => [c.name, c.city ?? "-", c.category ?? "-", c.membership_type ?? "-", String(c.member_count ?? 0), c.created_at.slice(0, 10)]),
      };
    }
    case "admins": {
      const { data } = await service.from("profiles").select("full_name, email, created_at").eq("is_admin", true).order("created_at");
      return {
        columns: ["Name", "Email", "Admin since"],
        rows: (data ?? []).map((u) => [u.full_name ?? "-", u.email ?? "-", u.created_at.slice(0, 10)]),
      };
    }
    case "visitors_no_book": {
      const { data: views } = await service.from("page_views").select("user_id").limit(5000);
      const viewerIds = [...new Set((views ?? []).map((v) => v.user_id as string))];
      if (!viewerIds.length) return { columns: ["Name", "Email", "Joined"], rows: [] };
      const { data: buyers } = await service.from("orders").select("user_id").eq("status", "CONFIRMED").in("user_id", viewerIds);
      const buyerSet = new Set((buyers ?? []).map((o) => o.user_id));
      const nonBuyers = viewerIds.filter((id) => !buyerSet.has(id)).slice(0, 500);
      if (!nonBuyers.length) return { columns: ["Name", "Email", "Joined"], rows: [] };
      const { data: profs } = await service.from("profiles").select("full_name, email, created_at").in("id", nonBuyers);
      return {
        columns: ["Name", "Email", "Joined"],
        rows: (profs ?? []).map((u) => [u.full_name ?? "-", u.email ?? "-", u.created_at.slice(0, 10)]),
      };
    }
  }
}
