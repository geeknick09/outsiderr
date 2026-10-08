"use server";

import { createServiceClient } from "@/modules/shared/server";
import type { CacheTicketRow } from "../offline/cache-mapper";
import { resolveScannerSessionEvent } from "../data/scan-token";

const PAGE = 1000;

/**
 * Offline door cache for the event a door session belongs to. Token-gated: the door
 * device sends its session token, never the PIN. Returns only what the gate needs
 * (status, tier name, holder name). No phone, no email. Pages past PostgREST's cap.
 */
export async function downloadScannerCacheAction(
  token: string,
): Promise<{ error: string | null; tickets?: CacheTicketRow[] }> {
  const eventId = await resolveScannerSessionEvent(token);
  if (!eventId) return { error: "Your door session has ended. Sign in again." };

  const svc = createServiceClient();

  const tickets = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc
      .from("tickets")
      .select("qr_hash, event_id, status, tier_id, order_id, checked_in_at")
      .eq("event_id", eventId)
      .in("status", ["VALID", "USED"])
      .range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    tickets.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const tiers = await fetchAllTiers(svc, eventId);
  const names = await fetchAllBuyerNames(svc, eventId);
  const tierName = new Map(tiers.map((t) => [t.id, t.name]));
  const buyerName = new Map(names.map((o) => [o.id, o.buyer_name]));

  return {
    error: null,
    tickets: tickets.map((t) => ({
      qr_hash: t.qr_hash,
      event_id: t.event_id,
      status: t.status,
      tier_name: t.tier_id ? tierName.get(t.tier_id) ?? null : null,
      holder_name: t.order_id ? buyerName.get(t.order_id) ?? null : null,
      checked_in_at: t.checked_in_at,
    })),
  };
}

async function fetchAllTiers(svc: ReturnType<typeof createServiceClient>, eventId: string) {
  const out: { id: string; name: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await svc.from("ticket_tiers").select("id, name").eq("event_id", eventId).range(from, from + PAGE - 1);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

async function fetchAllBuyerNames(svc: ReturnType<typeof createServiceClient>, eventId: string) {
  const out: { id: string; buyer_name: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await svc.from("orders").select("id, buyer_name").eq("event_id", eventId).range(from, from + PAGE - 1);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}
