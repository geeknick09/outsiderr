import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import { getOrganizerProfile } from "@/lib/data/organizer";

export interface EventStaffMember {
  id: string;
  eventId: string;
  organizerId: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
  displayName: string;
  createdAt: string;
  eventTitle?: string;
}

/**
 * List all door staff assigned by this organizer across all their events.
 */
export async function listOrganizerStaff(
  user: CurrentUser,
): Promise<EventStaffMember[]> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_staff")
    .select("*")
    .eq("organizer_id", organizer.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // Fetch event titles separately
  const eventIds = [...new Set(data.map((row) => row.event_id))];
  const { data: events } = await supabase
    .from("events")
    .select("id, title")
    .in("id", eventIds);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e.title]));

  return data.map((row) => {
    return {
      id: row.id,
      eventId: row.event_id,
      organizerId: row.organizer_id,
      email: row.email,
      phone: row.phone,
      userId: row.user_id,
      displayName: row.display_name,
      createdAt: row.created_at,
      eventTitle: eventMap[row.event_id],
    };
  });
}

/**
 * List door staff for a specific event.
 */
export async function listEventStaff(
  user: CurrentUser,
  eventId: string,
): Promise<EventStaffMember[]> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_staff")
    .select("*")
    .eq("event_id", eventId)
    .eq("organizer_id", organizer.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    organizerId: row.organizer_id,
    email: row.email,
    phone: row.phone,
    userId: row.user_id,
    displayName: row.display_name,
    createdAt: row.created_at,
  }));
}

/**
 * Add a door staff member to an event by email and/or phone.
 */
export async function addEventStaff(
  user: CurrentUser,
  eventId: string,
  email: string | null,
  phone: string | null,
  displayName: string,
): Promise<{ success: boolean; error?: string }> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { success: false, error: "No organizer profile." };

  if (!email && !phone) {
    return { success: false, error: "Email or phone is required." };
  }

  const supabase = await createClient();

  // Verify the event belongs to this organizer
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", organizer.id)
    .maybeSingle();

  if (!event) return { success: false, error: "Event not found." };

  // Check for duplicate assignment
  let query = supabase
    .from("event_staff")
    .select("id")
    .eq("event_id", eventId)
    .eq("organizer_id", organizer.id);

  if (email) {
    query = query.eq("email", email);
  } else if (phone) {
    query = query.eq("phone", phone);
  }

  const { data: existing } = await query.maybeSingle();
  if (existing) {
    return { success: false, error: "This person is already assigned to this event." };
  }

  // Try to resolve the user_id by looking up profiles by phone
  // Email-based lookup requires auth.users access which is not available via RLS
  // The user_id will be resolved when the staff member logs in (via a trigger or manual update)
  let userId: string | null = null;
  if (phone) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (profile) userId = profile.id;
  }

  const { error } = await supabase.from("event_staff").insert({
    event_id: eventId,
    organizer_id: organizer.id,
    email: email || null,
    phone: phone || null,
    user_id: userId,
    display_name: displayName,
  });

  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Remove a door staff member.
 */
export async function removeEventStaff(
  user: CurrentUser,
  staffId: string,
): Promise<{ success: boolean; error?: string }> {
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { success: false, error: "No organizer profile." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_staff")
    .delete()
    .eq("id", staffId)
    .eq("organizer_id", organizer.id);

  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Get all events that the current user is door staff for.
 * Used by the /scan page to populate the event dropdown.
 */
export async function getStaffEvents(
  user: CurrentUser,
): Promise<{ id: string; title: string; startsAt: string; endsAt: string | null; status: string; organizerName: string }[]> {
  const supabase = await createClient();

  // Get events where this user is assigned as door staff
  const { data: staffAssignments, error: staffError } = await supabase
    .from("event_staff")
    .select("event_id, organizer_id")
    .eq("user_id", user.id);

  if (staffError || !staffAssignments || staffAssignments.length === 0) {
    // Also check if the user is an organizer (organizers can scan their own events)
    const organizer = await getOrganizerProfile(user);
    if (!organizer) return [];

    const { data: orgEvents } = await supabase
      .from("events")
      .select("id, title, starts_at, ends_at, status")
      .eq("organizer_id", organizer.id)
      .in("status", ["PUBLISHED", "POSTPONED"])
      .order("starts_at", { ascending: true });

    return (orgEvents ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      status: e.status,
      organizerName: organizer.name,
    }));
  }

  const eventIds = [...new Set(staffAssignments.map((s) => s.event_id))];
  const { data: events } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, status, organizer_id")
    .in("id", eventIds)
    .in("status", ["PUBLISHED", "POSTPONED"])
    .order("starts_at", { ascending: true });

  if (!events || events.length === 0) return [];

  // Get organizer names
  const organizerIds = [...new Set(events.map((e) => e.organizer_id))];
  const { data: organizers } = await supabase
    .from("organizers")
    .select("id, name")
    .in("id", organizerIds);
  const orgMap = Object.fromEntries((organizers ?? []).map((o) => [o.id, o.name]));

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    status: e.status,
    organizerName: orgMap[e.organizer_id] ?? "Organizer",
  }));
}

/**
 * Check if the current user is door staff for a specific event.
 */
export async function isDoorStaffForEvent(
  user: CurrentUser,
  eventId: string,
): Promise<boolean> {
  const supabase = await createClient();

  // Check if user is assigned as door staff for this event
  const { data: assignment } = await supabase
    .from("event_staff")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (assignment) return true;

  // Also allow organizers to scan their own events
  const organizer = await getOrganizerProfile(user);
  if (organizer) {
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("organizer_id", organizer.id)
      .maybeSingle();
    if (event) return true;
  }

  return false;
}
