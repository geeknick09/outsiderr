import "server-only";

import { createClient } from "../auth/server";
import type { CurrentUser } from "../auth/auth";
import { getOrganizerProfile } from "@/modules/shared/server";

export type { BoxOfficePin, BoxOfficePinWithEvent } from "../lib/types/box-office-pins";
import type { BoxOfficePin, BoxOfficePinWithEvent } from "../lib/types/box-office-pins";

/**
 * List all box office PINs for an organizer's events.
 */
export async function listBoxOfficePins(user: CurrentUser): Promise<BoxOfficePinWithEvent[]> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("box_office_pins")
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
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    eventTitle: eventMap[row.event_id],
  }));
}

/**
 * List box office PINs for a specific event.
 */
export async function listBoxOfficePinsForEvent(
  user: CurrentUser,
  eventId: string,
): Promise<BoxOfficePin[]> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("box_office_pins")
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
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

/**
 * List all box office PINs across all events (admin only).
 */
export async function listAllBoxOfficePins(): Promise<BoxOfficePinWithEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("box_office_pins")
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
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    eventTitle: eventMap[row.event_id],
  }));
}
