import "server-only";

import { createClient } from "../auth/server";
import type { CurrentUser } from "../auth/auth";
import { getOrganizerProfile } from "@/modules/shared/server";

export type { ScannerPin, ScannerPinWithEvent } from "../lib/types/scanner-pins";
import type { ScannerPin, ScannerPinWithEvent } from "../lib/types/scanner-pins";

/**
 * List all scanner PINs for an organizer's events.
 */
export async function listScannerPins(user: CurrentUser): Promise<ScannerPinWithEvent[]> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scanner_pins")
    .select("*")
    .eq("organizer_id", organizer.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const eventIds = [...new Set(data.map((row) => row.event_id))];
  const { data: events } = await supabase
    .from("events")
    .select("id, title")
    .in("id", eventIds);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e.title]));

  return data.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    organizerId: row.organizer_id,
    pinCode: row.pin_code,
    staffName: row.staff_name,
    staffEmail: row.staff_email ?? null,
    staffPhone: row.staff_phone ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    eventTitle: eventMap[row.event_id],
  }));
}

/**
 * List scanner PINs for a specific event.
 */
export async function listEventScannerPins(
  user: CurrentUser,
  eventId: string,
): Promise<ScannerPin[]> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scanner_pins")
    .select("*")
    .eq("event_id", eventId)
    .eq("organizer_id", organizer.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    organizerId: row.organizer_id,
    pinCode: row.pin_code,
    staffName: row.staff_name,
    staffEmail: row.staff_email ?? null,
    staffPhone: row.staff_phone ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

/**
 * List all scanner PINs across all events (admin only).
 */
export async function listAllScannerPins(): Promise<ScannerPinWithEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scanner_pins")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const eventIds = [...new Set(data.map((row) => row.event_id))];
  const { data: events } = await supabase
    .from("events")
    .select("id, title")
    .in("id", eventIds);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e.title]));

  return data.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    organizerId: row.organizer_id,
    pinCode: row.pin_code,
    staffName: row.staff_name,
    staffEmail: row.staff_email ?? null,
    staffPhone: row.staff_phone ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    eventTitle: eventMap[row.event_id],
  }));
}
