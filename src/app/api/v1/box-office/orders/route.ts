import { z } from "zod";
import { headers } from "next/headers";

import { apiError, apiOk, createClient, readJson, withApi } from "@/modules/shared/server";
import { getRateLimitIdentifier, rateLimit, RATE_LIMITS } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  pin: z.string().min(4).max(12),
  tierId: z.string().uuid().optional().nullable(),
  buyerName: z.string().min(1).max(200),
  buyerPhone: z.string().max(20).optional().nullable(),
  buyerEmail: z.string().email().optional().nullable(),
  amountPaise: z.number().int().min(0).default(0),
  mode: z.enum(["WALKIN_PREEVENT", "WALKIN_QR", "WALKIN_INSTANT"]).default("WALKIN_PREEVENT"),
  idempotencyKey: z.string().uuid().optional(),
});

/**
 * POST /api/v1/box-office/orders — create a box-office sale (PIN-auth).
 * Verifies the box-office PIN, then creates the order via create_walkin_order
 * (which sets user_id=NULL and is_box_office=true).
 */
export async function POST(request: Request) {
  return withApi(request, async () => {
    const parsed = await readJson(request, bodySchema);
    if ("response" in parsed) return parsed.response;
    const { eventId, pin, tierId, buyerName, buyerPhone, buyerEmail, amountPaise, mode } = parsed.data;

    const h = await headers();
    const rl = rateLimit(`box-office-order:${getRateLimitIdentifier(h)}`, RATE_LIMITS.BOX_OFFICE_ORDER);
    if (rl.limited) return apiError("Too many orders. Please slow down and try again.", 429);

    const supabase = await createClient();

    const { data: pinCheck, error: pinError } = await supabase.rpc("verify_box_office_pin", {
      p_event_id: eventId,
      p_pin: pin,
    });
    if (pinError || !pinCheck?.[0]?.event_id) {
      return apiError("Invalid or inactive box office PIN.", 401);
    }

    const idempotencyKey = parsed.data.idempotencyKey ?? crypto.randomUUID();
    const { data: result, error } = await supabase.rpc("create_walkin_order", {
      p_event_id: eventId,
      p_buyer_name: buyerName,
      p_buyer_phone: buyerPhone ?? "",
      p_tier_id: tierId ?? null,
      p_buyer_email: buyerEmail ?? null,
      p_amount_paise: amountPaise,
      p_mode: mode,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return apiError(error.message, 400);

    const r = (result ?? {}) as { ticketId?: string; orderId?: string };
    return apiOk({ ticketId: r.ticketId, orderId: r.orderId });
  });
}
