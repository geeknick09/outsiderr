"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/modules/shared/server";
import { validate, verifyBoxOfficePinSchema, boxOfficeOrderSchema, rateLimit, getRateLimitIdentifier, RATE_LIMITS } from "@/modules/shared";

export async function verifyBoxOfficePinAction(
  eventId: string,
  pin: string,
): Promise<{
  error: string | null;
  success: boolean;
  event?: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    status: string;
    organizerName: string;
    staffName: string;
    role: string;
  };
}> {
  const v = validate(verifyBoxOfficePinSchema, { eventId, pin });
  if (!v.success) return { error: v.error, success: false };

  // Rate limit PIN verification to prevent brute-force attacks
  const h = await headers();
  const identifier = `pin-verify:${getRateLimitIdentifier(h)}`;
  const rl = rateLimit(identifier, RATE_LIMITS.PIN_VERIFY);
  if (rl.limited) {
    return { error: "Too many attempts. Please try again in a minute.", success: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_box_office_pin", {
    p_event_id: v.data.eventId,
    p_pin: v.data.pin,
  });

  if (error) return { error: error.message, success: false };

  const rows = (data ?? []) as {
    event_id: string | null;
    event_title: string | null;
    starts_at: string | null;
    ends_at: string | null;
    status: string | null;
    organizer_name: string | null;
    staff_name: string | null;
    role: string | null;
  }[];

  if (!rows || rows.length === 0 || !rows[0].event_id) {
    return { error: "Invalid PIN for this event.", success: false };
  }

  const row = rows[0];
  const verifiedEventId = row.event_id as string;
  return {
    error: null,
    success: true,
    event: {
      id: verifiedEventId,
      title: row.event_title ?? "",
      startsAt: row.starts_at ?? "",
      endsAt: row.ends_at,
      status: row.status ?? "",
      organizerName: row.organizer_name ?? "",
      staffName: row.staff_name ?? "",
      role: row.role ?? "",
    },
  };
}

/**
 * Create a box office walk-in order (PIN-based, no Supabase auth required).
 * Uses the existing create_walkin_order RPC which now sets user_id=NULL and is_box_office=true.
 */
export async function createBoxOfficeOrderAction(formData: FormData): Promise<{
  error: string | null;
  success: boolean;
  ticketId?: string;
  orderId?: string;
}> {
  const eventId = String(formData.get("eventId") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const tierId = String(formData.get("tierId") ?? "") || null;
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim();
  const buyerEmail = String(formData.get("buyerEmail") ?? "").trim() || null;
  const amountRupees = Number(formData.get("amount") ?? 0);
  const amountPaise = Math.round(amountRupees * 100);
  const mode = String(formData.get("mode") ?? "WALKIN_PREEVENT");

  const v = validate(boxOfficeOrderSchema, {
    eventId,
    pin,
    tierId,
    buyerName,
    buyerPhone,
    buyerEmail,
    amountPaise,
    mode,
  });
  if (!v.success) return { error: v.error, success: false };

  const { eventId: validEventId, pin: validPin, tierId: validTierId, buyerName: validName, buyerPhone: validPhone, buyerEmail: validEmail, amountPaise: validAmount, mode: validMode } = v.data;

  // Rate limit box office order creation to prevent duplicate spam
  const h = await headers();
  const identifier = `box-office-order:${getRateLimitIdentifier(h)}`;
  const rl = rateLimit(identifier, RATE_LIMITS.BOX_OFFICE_ORDER);
  if (rl.limited) {
    return { error: "Too many orders. Please slow down and try again.", success: false };
  }

  // Verify the PIN is valid before creating the order
  const supabase = await createClient();
  const { data: pinCheck, error: pinError } = await supabase.rpc("verify_box_office_pin", {
    p_event_id: validEventId,
    p_pin: validPin,
  });

  if (pinError || !pinCheck || !pinCheck[0]?.event_id) {
    return { error: "Invalid or inactive box office PIN.", success: false };
  }

  // Create the walk-in order (RPC sets user_id=NULL, is_box_office=true)
  // Generate idempotency key to prevent duplicate orders from double-clicks
  const idempotencyKey = crypto.randomUUID();
  const { data: result, error } = await supabase.rpc("create_walkin_order", {
    p_event_id: validEventId,
    p_buyer_name: validName,
    p_buyer_phone: validPhone,
    p_tier_id: validTierId,
    p_buyer_email: validEmail,
    p_amount_paise: validAmount,
    p_mode: validMode,
    p_idempotency_key: idempotencyKey,
  });

  if (error) return { error: error.message, success: false };

  const walkinResult = (result ?? {}) as { ticketId?: string; orderId?: string };
  return {
    error: null,
    success: true,
    ticketId: walkinResult.ticketId,
    orderId: walkinResult.orderId,
  };
}
