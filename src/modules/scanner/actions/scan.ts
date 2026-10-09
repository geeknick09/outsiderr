"use server";

import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/modules/shared/server";
import { validate, verifyScannerPinSchema, staffLoginSchema, rateLimit, getRateLimitIdentifier, RATE_LIMITS, UUID_RE } from "@/modules/shared";

export async function verifyScannerPinAction(
  eventId: string,
  pin: string,
): Promise<{
  error: string | null;
  success: boolean;
  /** "RATE_LIMITED" when the PIN-verify limit tripped - routes map to 429. */
  code?: "RATE_LIMITED";
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
    return { error: "Too many attempts. Please try again in a minute.", success: false, code: "RATE_LIMITED" };
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

export interface StaffDoorEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  organizerName: string;
}

/**
 * Staff sign-in for the door scanner: phone or email + password ->
 * staff session token + the events they are assigned to.
 */
export async function staffDoorLoginAction(
  identifier: string,
  password: string,
): Promise<{ error: string | null; staffToken?: string; staffName?: string; events?: StaffDoorEvent[] }> {
  const v = validate(staffLoginSchema, { identifier, password });
  if (!v.success) return { error: v.error };
  const h = await headers();
  const rl = rateLimit(`staff-door-login:${getRateLimitIdentifier(h)}`, RATE_LIMITS.PIN_VERIFY);
  if (rl.limited) return { error: "Too many attempts. Please try again in a minute." };

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("staff_login_session", {
    p_identifier: v.data.identifier,
    p_password: v.data.password,
  });
  if (error) return { error: error.message };
  const row = data?.[0];
  if (!row) return { error: "Phone/email or password is incorrect, or your access is inactive." };

  const { data: assigned } = await supabase
    .from("staff_event_assignments")
    .select("event_id")
    .eq("staff_id", row.staff_id)
    .eq("is_active", true);
  const ids = (assigned ?? []).map((a) => a.event_id);
  let events: StaffDoorEvent[] = [];
  if (ids.length) {
    const { data: evs } = await supabase
      .from("events")
      .select("id, title, starts_at, ends_at, status, organizer_id")
      .in("id", ids)
      .in("status", ["PUBLISHED", "POSTPONED"])
      .order("starts_at", { ascending: true });
    const orgIds = [...new Set((evs ?? []).map((e) => e.organizer_id))];
    const { data: orgs } = orgIds.length
      ? await supabase.from("organizers_public").select("id, name").in("id", orgIds)
      : { data: [] };
    const orgMap = Object.fromEntries((orgs ?? []).map((o) => [o.id, o.name]));
    events = (evs ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      status: e.status,
      organizerName: orgMap[e.organizer_id] ?? "Organizer",
    }));
  }

  return { error: null, staffToken: row.token, staffName: row.name, events };
}

/**
 * Staff session + event -> event-scoped door token. The device sends the door
 * token for scans from now on, never the staff password.
 */
export async function staffDoorSessionAction(
  staffToken: string,
  eventId: string,
): Promise<{
  error: string | null;
  token?: string;
  eventTitle?: string;
  organizerName?: string;
  startsAt?: string;
  endsAt?: string | null;
  status?: string;
  staffName?: string;
  validCount?: number;
  checkedInCount?: number;
}> {
  if (!staffToken || !UUID_RE.test(eventId)) return { error: "Pick an event to scan for." };

  const { data, error } = await createServiceClient().rpc("staff_door_session", {
    p_session_token: staffToken,
    p_event_id: eventId,
  });
  if (error) return { error: error.message };
  const row = data?.[0];
  if (!row?.token) return { error: "Could not start the door session." };
  return {
    error: null,
    token: row.token,
    eventTitle: row.event_title ?? "",
    organizerName: row.organizer_name ?? "",
    startsAt: row.starts_at ?? "",
    endsAt: row.ends_at,
    staffName: row.staff_name ?? "",
    validCount: row.valid_count ?? 0,
    checkedInCount: row.checked_in_count ?? 0,
  };
}

/** Door PIN -> event-scoped session token. The door device sends the token from now on, never the PIN. */
export async function scannerLoginAction(
  eventId: string,
  pin: string,
): Promise<{ error: string | null; token?: string }> {
  const v = validate(verifyScannerPinSchema, { eventId, pin });
  if (!v.success) return { error: v.error };
  const h = await headers();
  const rl = rateLimit(`pin-verify:${getRateLimitIdentifier(h)}`, RATE_LIMITS.PIN_VERIFY);
  if (rl.limited) return { error: "Too many attempts. Please try again in a minute." };

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("scanner_login_session", {
    p_event_id: v.data.eventId,
    p_pin: v.data.pin,
  });
  if (error) return { error: error.message };
  const token = data?.[0]?.token;
  if (!token) return { error: "Invalid PIN for this event." };
  return { error: null, token };
}
