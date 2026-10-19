import "server-only";

import { createServiceClient } from "../../shared/auth/service";

/**
 * Virality coefficient (K-factor proxy): referred acquisitions ÷ organic.
 * - Events: orders attributed to a promoter link/code (orders.promoter_id)
 * - Communities: members who joined via a member referral
 *   (community_members.referred_by_member_id)
 * K > 1.0 means each acquisition generates more than one new acquisition.
 */

export interface ViralitySlice {
  referred: number;
  organic: number;
}

export interface EntityVirality {
  id: string;
  name: string;
  kind: "EVENT" | "COMMUNITY";
  referred: number;
  organic: number;
  k: number;
}

function k(referred: number, organic: number): number {
  if (organic === 0 && referred === 0) return 0;
  if (organic === 0) return referred; // fully referred - K unbounded, cap at count
  return Math.round((referred / organic) * 100) / 100;
}

/** Platform-wide virality - admin analytics. Optional date range + event city. */
export async function getPlatformVirality(filter?: {
  city?: string; from?: string; to?: string;
}): Promise<{
  orders: ViralitySlice;
  joins: ViralitySlice;
  k: number;
}> {
  const service = createServiceClient();
  const f = filter ?? {};
  let promoQ = service.from("orders").select("id, event_id").not("promoter_id", "is", null).eq("status", "CONFIRMED");
  let totalQ = service.from("orders").select("id, event_id").eq("status", "CONFIRMED");
  let refQ = service.from("community_members").select("id", { count: "exact", head: true }).not("referred_by_member_id", "is", null);
  let joinQ = service.from("community_members").select("id", { count: "exact", head: true });
  if (f.from) {
    promoQ = promoQ.gte("created_at", `${f.from}T00:00:00Z`);
    totalQ = totalQ.gte("created_at", `${f.from}T00:00:00Z`);
    refQ = refQ.gte("created_at", `${f.from}T00:00:00Z`);
    joinQ = joinQ.gte("created_at", `${f.from}T00:00:00Z`);
  }
  if (f.to) {
    promoQ = promoQ.lte("created_at", `${f.to}T23:59:59Z`);
    totalQ = totalQ.lte("created_at", `${f.to}T23:59:59Z`);
    refQ = refQ.lte("created_at", `${f.to}T23:59:59Z`);
    joinQ = joinQ.lte("created_at", `${f.to}T23:59:59Z`);
  }
  let cityEvents: Set<string> | null = null;
  if (f.city) {
    const { data: evs } = await service.from("events").select("id").eq("city", f.city);
    cityEvents = new Set((evs ?? []).map((e) => e.id));
  }
  const [promo, totalOrders, referred, totalJoins] = await Promise.all([promoQ, totalQ, refQ, joinQ]);
  const promoRows = (promo.data ?? []).filter((o) => !cityEvents || cityEvents.has(o.event_id));
  const totalRows = (totalOrders.data ?? []).filter((o) => !cityEvents || cityEvents.has(o.event_id));
  const ro = promoRows.length;
  const to = totalRows.length;
  const rj = referred.count ?? 0;
  const tj = totalJoins.count ?? 0;
  return {
    orders: { referred: ro, organic: Math.max(0, to - ro) },
    joins: { referred: rj, organic: Math.max(0, tj - rj) },
    k: k(ro + rj, Math.max(0, to - ro) + Math.max(0, tj - rj)),
  };
}

/** Per-event virality - event analytics tab. */
export async function getEventVirality(eventId: string): Promise<ViralitySlice & { k: number }> {
  const service = createServiceClient();
  const [promo, total] = await Promise.all([
    service.from("orders").select("id", { count: "exact", head: true }).eq("event_id", eventId).not("promoter_id", "is", null).in("status", ["CONFIRMED"]),
    service.from("orders").select("id", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["CONFIRMED"]),
  ]);
  const referred = promo.count ?? 0;
  const organic = Math.max(0, (total.count ?? 0) - referred);
  return { referred, organic, k: k(referred, organic) };
}

/** Per-community virality. */
export async function getCommunityVirality(communityId: string): Promise<ViralitySlice & { k: number }> {
  const service = createServiceClient();
  const [referred, total] = await Promise.all([
    service.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", communityId).not("referred_by_member_id", "is", null),
    service.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", communityId),
  ]);
  const r = referred.count ?? 0;
  const o = Math.max(0, (total.count ?? 0) - r);
  return { referred: r, organic: o, k: k(r, o) };
}

/** Per-entity virality for one organizer - events (promoter share) + owned
 * communities (member referrals). */
export async function getOrganizerVirality(organizerId: string): Promise<{
  overall: { referred: number; organic: number; k: number };
  entities: EntityVirality[];
}> {
  const service = createServiceClient();

  const [{ data: evs }, { data: comms }] = await Promise.all([
    service.from("events").select("id, title").eq("organizer_id", organizerId),
    service.from("communities").select("id, name").eq("owner_id", organizerId),
  ]);
  const eventIds = (evs ?? []).map((e) => e.id);
  const commIds = (comms ?? []).map((c) => c.id);

  const [promoOrders, allOrders, refJoins, allJoins] = await Promise.all([
    eventIds.length
      ? service.from("orders").select("id, event_id").in("event_id", eventIds).not("promoter_id", "is", null).in("status", ["CONFIRMED"])
      : Promise.resolve({ data: [] as { event_id: string }[] }),
    eventIds.length
      ? service.from("orders").select("id, event_id").in("event_id", eventIds).in("status", ["CONFIRMED"])
      : Promise.resolve({ data: [] as { event_id: string }[] }),
    commIds.length
      ? service.from("community_members").select("id, community_id").in("community_id", commIds).not("referred_by_member_id", "is", null)
      : Promise.resolve({ data: [] as { community_id: string }[] }),
    commIds.length
      ? service.from("community_members").select("id, community_id").in("community_id", commIds)
      : Promise.resolve({ data: [] as { community_id: string }[] }),
  ]);

  const promoByEvent = new Map<string, number>();
  for (const r of promoOrders.data ?? []) promoByEvent.set(r.event_id, (promoByEvent.get(r.event_id) ?? 0) + 1);
  const totalByEvent = new Map<string, number>();
  for (const r of allOrders.data ?? []) totalByEvent.set(r.event_id, (totalByEvent.get(r.event_id) ?? 0) + 1);
  const refByComm = new Map<string, number>();
  for (const r of refJoins.data ?? []) refByComm.set(r.community_id, (refByComm.get(r.community_id) ?? 0) + 1);
  const totalByComm = new Map<string, number>();
  for (const r of allJoins.data ?? []) totalByComm.set(r.community_id, (totalByComm.get(r.community_id) ?? 0) + 1);

  const entities: EntityVirality[] = [];
  let tRef = 0;
  let tOrg = 0;

  for (const e of evs ?? []) {
    const r = promoByEvent.get(e.id) ?? 0;
    const o = Math.max(0, (totalByEvent.get(e.id) ?? 0) - r);
    tRef += r;
    tOrg += o;
    entities.push({ id: e.id, name: e.title, kind: "EVENT", referred: r, organic: o, k: k(r, o) });
  }
  for (const c of comms ?? []) {
    const r = refByComm.get(c.id) ?? 0;
    const o = Math.max(0, (totalByComm.get(c.id) ?? 0) - r);
    tRef += r;
    tOrg += o;
    entities.push({ id: c.id, name: c.name, kind: "COMMUNITY", referred: r, organic: o, k: k(r, o) });
  }

  entities.sort((a, b) => b.k - a.k || b.referred - a.referred);
  return { overall: { referred: tRef, organic: tOrg, k: k(tRef, tOrg) }, entities };
}

export interface WarmLead {
  userName: string;
  email: string | null;
  phone: string | null;
  entityType: "EVENT" | "COMMUNITY";
  entityName: string;
  lastViewedAt: string;
}

/** Organizer's "warm audience": signed-in users who viewed their events or
 * communities but never bought a ticket / joined. Retargeting list. */
export async function getWarmAudience(organizerId: string, limit = 50): Promise<WarmLead[]> {
  const service = createServiceClient();
  const [{ data: evs }, { data: comms }] = await Promise.all([
    service.from("events").select("id, title").eq("organizer_id", organizerId),
    service.from("communities").select("id, name").eq("owner_id", organizerId),
  ]);
  const evMap = new Map((evs ?? []).map((e) => [e.id, e.title]));
  const commMap = new Map((comms ?? []).map((c) => [c.id, c.name]));
  const allIds = [...evMap.keys(), ...commMap.keys()];
  if (!allIds.length) return [];

  const { data: views } = await service
    .from("page_views")
    .select("user_id, entity_type, entity_id, created_at")
    .in("entity_id", allIds)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (!views?.length) return [];

  // Latest view per user per entity.
  const lastView = new Map<string, { entityType: string; entityId: string; at: string }>();
  for (const v of views) {
    const k = `${v.user_id}:${v.entity_id}`;
    if (!lastView.has(k)) {
      lastView.set(k, { entityType: v.entity_type, entityId: v.entity_id, at: v.created_at });
    }
  }
  const viewerIds = [...new Set([...lastView.keys()].map((k) => k.split(":")[0]))];

  const [{ data: buyers }, { data: members }] = await Promise.all([
    service.from("orders").select("user_id, event_id").in("event_id", [...evMap.keys()]).eq("status", "CONFIRMED"),
    commMap.size
      ? service.from("community_members").select("user_id, community_id").in("community_id", [...commMap.keys()])
      : Promise.resolve({ data: [] }),
  ]);
  const bought = new Set((buyers ?? []).map((o) => `${o.user_id}:${o.event_id}`));
  const joined = new Set((members ?? []).map((m) => `${m.user_id}:${m.community_id}`));

  const leads: { userId: string; entityType: "EVENT" | "COMMUNITY"; entityId: string; at: string }[] = [];
  for (const [k, v] of lastView) {
    const userId = k.split(":")[0];
    if (v.entityType === "EVENT" && evMap.has(v.entityId) && !bought.has(k)) {
      leads.push({ userId, entityType: "EVENT", entityId: v.entityId, at: v.at });
    }
    if (v.entityType === "COMMUNITY" && commMap.has(v.entityId) && !joined.has(k)) {
      leads.push({ userId, entityType: "COMMUNITY", entityId: v.entityId, at: v.at });
    }
  }
  leads.sort((a, b) => b.at.localeCompare(a.at));

  const { data: profs } = viewerIds.length
    ? await service.from("profiles").select("id, full_name, email, phone").in("id", viewerIds.slice(0, 1000))
    : { data: [] };
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

  return leads.slice(0, limit).map((l) => ({
    userName: profMap.get(l.userId)?.full_name ?? "Someone",
    email: profMap.get(l.userId)?.email ?? null,
    phone: profMap.get(l.userId)?.phone ?? null,
    entityType: l.entityType,
    entityName: l.entityType === "EVENT" ? (evMap.get(l.entityId) ?? "-") : (commMap.get(l.entityId) ?? "-"),
    lastViewedAt: l.at,
  }));
}

/** Warm audience scoped to ONE community: viewers of the community page or
 * any of its events who neither joined nor bought. */
export async function getCommunityWarmAudience(communityId: string, limit = 50): Promise<WarmLead[]> {
  const service = createServiceClient();
  const [{ data: evs }, { data: comm }] = await Promise.all([
    service.from("events").select("id, title").eq("community_id", communityId),
    service.from("communities").select("id, name").eq("id", communityId).maybeSingle(),
  ]);
  const evMap = new Map((evs ?? []).map((e) => [e.id, e.title]));
  const entityIds = [...evMap.keys(), communityId];
  const { data: views } = await service
    .from("page_views")
    .select("user_id, entity_type, entity_id, created_at")
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (!views?.length) return [];

  const lastView = new Map<string, { entityType: string; entityId: string; at: string }>();
  for (const v of views) {
    const k = `${v.user_id}:${v.entity_id}`;
    if (!lastView.has(k)) lastView.set(k, { entityType: v.entity_type, entityId: v.entity_id, at: v.created_at });
  }
  const viewerIds = [...new Set([...lastView.keys()].map((k) => k.split(":")[0]))];

  const [{ data: buyers }, { data: members }] = await Promise.all([
    evMap.size
      ? service.from("orders").select("user_id, event_id").in("event_id", [...evMap.keys()]).eq("status", "CONFIRMED")
      : Promise.resolve({ data: [] }),
    service.from("community_members").select("user_id").eq("community_id", communityId),
  ]);
  const bought = new Set((buyers ?? []).map((o) => `${o.user_id}:${o.event_id}`));
  const joined = new Set((members ?? []).map((m) => m.user_id));

  const leads: { userId: string; entityType: "EVENT" | "COMMUNITY"; entityId: string; at: string }[] = [];
  for (const [k, v] of lastView) {
    const userId = k.split(":")[0];
    if (v.entityType === "EVENT" && evMap.has(v.entityId) && !bought.has(k)) {
      leads.push({ userId, entityType: "EVENT", entityId: v.entityId, at: v.at });
    }
    if (v.entityType === "COMMUNITY" && v.entityId === communityId && !joined.has(userId)) {
      leads.push({ userId, entityType: "COMMUNITY", entityId: v.entityId, at: v.at });
    }
  }
  leads.sort((a, b) => b.at.localeCompare(a.at));

  const { data: profs } = viewerIds.length
    ? await service.from("profiles").select("id, full_name, email, phone").in("id", viewerIds.slice(0, 1000))
    : { data: [] };
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

  return leads.slice(0, limit).map((l) => {
    const p = profMap.get(l.userId);
    return {
      userName: p?.full_name ?? "Anonymous user",
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      entityType: l.entityType,
      entityName: l.entityType === "EVENT" ? evMap.get(l.entityId) ?? "" : comm?.name ?? "",
      lastViewedAt: l.at,
    };
  });
}
