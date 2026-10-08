"use server";

import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/modules/shared/server";
import { validate, verifyScannerPinSchema, rateLimit, getRateLimitIdentifier, RATE_LIMITS } from "@/modules/shared";
import type { CacheTicketRow } from "../offline/cache-mapper";

const PAGE = 1000;

/**
 * Offline door cache for one event. PIN-gated (the door device has no Supabase
 * session). Returns only what the gate needs: status, tier and holder name.
 * No phone, no email. Pages past PostgREST's 1000-row default cap.
 */
export async function downloadScannerCacheAction(
  eventId: string,
  pin: string,
): Promise<{ error: string | null; tickets?: CacheTicketRow[] }> {
  const v = validate(verifyScannerPinSchema, { eventId, pin });
  if (!v.success) return { error: v.error };

  const h = await headers();
  const rl = rateLimit(`pin-verify:${getRateLimitIdentifier(h)}`, RATE_LIMITS.PIN_VERIFY);
  if (rl.limited) return { error: "Too many attempts. Please try again in a minute." };

  const { data: pinRows, error: pinError } = await (await createClient()).rpc("verify_scanner_pin", {
    p_event_id: v.data.eventId,
    p_pin: v.data.pin,
  });
  if (pinError) return { error: pinError.message };
  if (!pinRows?.[0]?.event_id) return { error: "Invalid PIN for this event." };

  const svc = createServiceClient();

  const tickets = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc
      .from("tickets")
      .select("qr_hash, event_id, status, tier_id, order_id, checked_in_at")
      .eq("event_id", v.data.eventId)
      .in("status", ["VALID", "USED"])
      .range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    tickets.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const tiers = await fetchAllTiers(svc, v.data.eventId);
  const names = await fetchAllBuyerNames(svc, v.data.eventId);
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
