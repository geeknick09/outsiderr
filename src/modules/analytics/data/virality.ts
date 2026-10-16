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
