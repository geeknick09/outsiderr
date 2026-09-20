"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getCurrentUser } from "@/modules/shared/server";
import { createClient } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import {
  validate,
  generatePinsSchema,
  verifyScannerPinSchema,
  revokePinSchema,
} from "@/modules/shared";
import { rateLimit, getRateLimitIdentifier, RATE_LIMITS } from "@/modules/shared";

export interface GeneratePinsResult {
  error: string | null;
  success: boolean;
  pins?: { pinCode: string; staffName: string }[];
}

/**
 * Generate scanner PINs for an event.
 * Supports bulk generation by passing arrays of staff names + optional emails/phones.
 */
export async function generateScannerPinsAction(
  eventId: string,
  staffNames: string[],
  staffEmails?: string[],
  staffPhones?: string[],
): Promise<GeneratePinsResult> {
  const v = validate(generatePinsSchema, { eventId, staffNames, role: "ORGANIZER" });
  if (!v.success) return { error: v.error, success: false };
  const { eventId: validEventId, staffNames: validNames } = v.data;

  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in.", success: false };

  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "No organizer profile.", success: false };

  // Verify organizer owns this event
  const supabase = await createClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("id")
    .eq("id", validEventId)
    .eq("organizer_id", organizer.id)
    .maybeSingle();
  if (!eventRow) return { error: "Event not found.", success: false };

  const { data, error } = await supabase.rpc("generate_scanner_pins", {
    p_event_id: validEventId,
    p_staff_names: validNames,
    p_staff_emails: staffEmails ?? [],
    p_staff_phones: staffPhones ?? [],
  });

  if (error) return { error: error.message, success: false };

  const pins = ((data ?? []) as { pin_code: string; staff_name: string }[]).map((r) => ({
    pinCode: r.pin_code,
    staffName: r.staff_name,
  }));

  revalidatePath(`/organizer/events/${validEventId}`);
  return { error: null, success: true, pins };
}

/**
 * Revoke a scanner PIN (set is_active = false).
 */
export async function revokeScannerPinAction(
  pinId: string,
  eventId: string,
): Promise<{ error: string | null; success: boolean }> {
  const v = validate(revokePinSchema, { pinId, eventId });
  if (!v.success) return { error: v.error, success: false };

  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in.", success: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_scanner_pin", { p_pin_id: v.data.pinId });
  if (error) return { error: error.message, success: false };

  revalidatePath(`/organizer/events/${v.data.eventId}`);
  return { error: null, success: true };
}

/**
 * Verify a scanner PIN (public — no auth required, used by /scan page).
 * Returns event info if valid.
 */
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
