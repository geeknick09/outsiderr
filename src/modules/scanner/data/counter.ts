import "server-only";

import { createServiceClient } from "@/modules/shared/server";

export interface CounterStaff {
  id: string;
  name: string;
  ownerType: "ADMIN" | "ORGANIZER";
}

export interface CounterEvent {
  id: string;
  title: string;
  startsAt: string;
  tiers: { id: string; name: string; pricePaise: number; remaining: number }[];
}

/** Resolve a counter token to an active staff member. Null when the token is unknown or expired. */
export async function resolveCounterStaff(token: string): Promise<CounterStaff | null> {
  if (!token || token.length !== 64) return null;
  const { data } = await createServiceClient().rpc("staff_session_staff", { p_token: token });
  const row = data?.[0];
  if (!row) return null;
  return { id: row.staff_id, name: row.name, ownerType: row.owner_type as CounterStaff["ownerType"] };
}

/** Live events this staff member is assigned to, with tier availability. */
export async function listCounterEvents(staffId: string): Promise<CounterEvent[]> {
  const svc = createServiceClient();
  const { data: assigned } = await svc
    .from("staff_event_assignments")
    .select("event_id")
    .eq("staff_id", staffId)
    .eq("is_active", true);
  const eventIds = (assigned ?? []).map((a) => a.event_id);
  if (eventIds.length === 0) return [];

  const { data: events } = await svc
    .from("events")
    .select("id, title, starts_at, status")
    .in("id", eventIds)
    .in("status", ["PUBLISHED", "POSTPONED"])
    .order("starts_at", { ascending: true });
  const liveIds = (events ?? []).map((e) => e.id);
  if (liveIds.length === 0) return [];

  const { data: tiers } = await svc
    .from("ticket_tiers")
    .select("id, event_id, name, price_paise, quantity, quantity_sold, quantity_reserved")
    .in("event_id", liveIds);

  return (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    tiers: (tiers ?? [])
      .filter((t) => t.event_id === e.id)
      .map((t) => ({
        id: t.id,
        name: t.name,
        pricePaise: t.price_paise,
        remaining: Math.max(0, t.quantity - t.quantity_sold - (t.quantity_reserved ?? 0)),
      })),
  }));
}

/** Cash still held per staff member and event, for the handover panel. */
export async function listCashOutstanding(staffIds: string[], eventIds: string[]) {
  const svc = createServiceClient();
  const out: { staffId: string; eventId: string; orderCount: number; amountPaise: number }[] = [];
  for (const staffId of staffIds) {
    for (const eventId of eventIds) {
      const { data } = await svc.rpc("staff_cash_outstanding", { p_staff_id: staffId, p_event_id: eventId });
      const row = data?.[0];
      if (row && (Number(row.order_count) > 0 || Number(row.amount_paise) !== 0)) {
        out.push({ staffId, eventId, orderCount: Number(row.order_count), amountPaise: Number(row.amount_paise) });
      }
    }
  }
  return out.filter((r) => r.amountPaise > 0);
}
