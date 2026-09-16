import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";

// ================================================================
// Event Subscriptions
// ================================================================

/**
 * Check if the current user is subscribed to an event.
 */
export async function isSubscribedToEvent(
  user: CurrentUser | null,
  eventId: string,
): Promise<boolean> {
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_subscriptions")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
}

/**
 * Get subscriber count for an event (for organizers/analytics).
 */
export async function getEventSubscriberCount(eventId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("event_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  return count ?? 0;
}

/**
 * Get all subscriber user IDs for an event.
 * Used when sending event-change notifications.
 */
export async function getEventSubscriberUserIds(eventId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_subscriptions")
    .select("user_id")
    .eq("event_id", eventId);
  return (data ?? []).map((s) => s.user_id).filter(Boolean);
}

// ================================================================
// Organizer Follows
// ================================================================

/**
 * Get follower count for an organizer.
 */
export async function getOrganizerFollowerCount(organizerId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("organizer_follows")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", organizerId);
  return count ?? 0;
}

/**
 * Check if the current user follows an organizer.
 */
export async function isFollowingOrganizer(
  user: CurrentUser | null,
  organizerId: string,
): Promise<boolean> {
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizer_follows")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("follower_id", user.id)
    .maybeSingle();
  return !!data;
}

// ================================================================
// Event Collaborators
// ================================================================

export interface EventCollaborator {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerPhotoUrl: string | null;
  status: string;
  invitedBy: string;
  createdAt: string;
}

/**
 * Get accepted collaborators for an event (public — shown on event page).
 */
export async function getEventCollaborators(eventId: string): Promise<EventCollaborator[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_collaborators")
    .select(`
      id,
      organizer_id,
      status,
      invited_by,
      created_at,
      organizers!event_collaborators_organizer_id_fkey (
        name,
        photo_url
      )
    `)
    .eq("event_id", eventId)
    .eq("status", "ACCEPTED")
    .order("created_at", { ascending: true });

  return (data ?? []).map((c) => ({
    id: c.id,
    organizerId: c.organizer_id,
    organizerName: c.organizers?.name ?? "Unknown",
    organizerPhotoUrl: c.organizers?.photo_url ?? null,
    status: c.status,
    invitedBy: c.invited_by,
    createdAt: c.created_at,
  }));
}

/**
 * Get all collaboration invites for the current user (as the invited organizer).
 */
export async function getPendingCollaborationInvites(
  user: CurrentUser,
): Promise<
  {
    id: string;
    eventId: string;
    eventTitle: string;
    invitedByName: string;
    status: string;
    createdAt: string;
  }[]
> {
  const supabase = await createClient();

  // Get the current user's organizer profile
  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg) return [];

  const { data } = await supabase
    .from("event_collaborators")
    .select(`
      id,
      event_id,
      status,
      created_at,
      events!event_collaborators_event_id_fkey (
        title
      ),
      organizers!event_collaborators_invited_by_fkey (
        name
      )
    `)
    .eq("organizer_id", myOrg.id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  return (data ?? []).map((c) => ({
    id: c.id,
    eventId: c.event_id,
    eventTitle: c.events?.title ?? "Unknown event",
    invitedByName: c.organizers?.name ?? "Unknown organizer",
    status: c.status,
    createdAt: c.created_at,
  }));
}

/**
 * Get all collaborators for an event (including pending) — for the event owner.
 */
export async function getEventCollaboratorsForOwner(
  user: CurrentUser,
  eventId: string,
): Promise<
  {
    id: string;
    organizerId: string;
    organizerName: string;
    organizerPhotoUrl: string | null;
    status: string;
    createdAt: string;
  }[]
> {
  const supabase = await createClient();

  // Verify ownership
  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return [];

  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg || myOrg.id !== event.organizer_id) return [];

  const { data } = await supabase
    .from("event_collaborators")
    .select(`
      id,
      organizer_id,
      status,
      created_at,
      organizers!event_collaborators_organizer_id_fkey (
        name,
        photo_url
      )
    `)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((c) => ({
    id: c.id,
    organizerId: c.organizer_id,
    organizerName: c.organizers?.name ?? "Unknown",
    organizerPhotoUrl: c.organizers?.photo_url ?? null,
    status: c.status,
    createdAt: c.created_at,
  }));
}
