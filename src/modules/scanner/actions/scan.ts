"use server";

import { headers } from "next/headers";
import { createClient } from "@/modules/shared/server";
import { validate, verifyScannerPinSchema, rateLimit, getRateLimitIdentifier, RATE_LIMITS } from "@/modules/shared";

export async function verifyScannerPinAction(
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
    validCount: number;
    checkedInCount: number;
    staffName: string;
  };
}> {
  const v = validate(verifyScannerPinSchema, { eventId, pin });
  if (!v.success) return { error: v.error, success: false };

  // Rate limit PIN verification to prevent brute-force attacks
  const h = await headers();
  const identifier = `pin-verify:${getRateLimitIdentifier(h)}`;
  const rl = rateLimit(identifier, RATE_LIMITS.PIN_VERIFY);
  if (rl.limited) {
    return { error: "Too many attempts. Please try again in a minute.", success: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_scanner_pin", {
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
    valid_count: number | null;
    checked_in_count: number | null;
    staff_name: string | null;
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
      validCount: row.valid_count ?? 0,
      checkedInCount: row.checked_in_count ?? 0,
      staffName: row.staff_name ?? "",
    },
  };
}
