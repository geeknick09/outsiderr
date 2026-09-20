import { createClient } from "../auth/server";
import type { CurrentUser } from "../auth/auth";

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
    .select("id, organizer_id, status, invited_by, created_at")
    .eq("event_id", eventId)
    .eq("status", "ACCEPTED")
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return [];

  // Fetch organizer details separately (avoids nested join type issues)
  const organizerIds = [...new Set(data.map((c) => c.organizer_id))];
  const { data: orgs } = await supabase
    .from("organizers")
    .select("id, name, avatar_url")
    .in("id", organizerIds);

  const orgMap = new Map((orgs ?? []).map((o) => [o.id, o]));

  return data.map((c) => ({
    id: c.id,
    organizerId: c.organizer_id,
    organizerName: orgMap.get(c.organizer_id)?.name ?? "Unknown",
    organizerPhotoUrl: orgMap.get(c.organizer_id)?.avatar_url ?? null,
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
    .select("id, event_id, invited_by, status, created_at")
    .eq("organizer_id", myOrg.id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) return [];

  // Fetch event titles and inviter names separately
  const eventIds = [...new Set(data.map((c) => c.event_id))];
  const inviterIds = [...new Set(data.map((c) => c.invited_by))];

  const [eventsResult, invitersResult] = await Promise.all([
    supabase.from("events").select("id, title").in("id", eventIds),
    supabase.from("organizers").select("id, name").in("id", inviterIds),
  ]);

  const eventMap = new Map((eventsResult.data ?? []).map((e) => [e.id, e.title]));
  const inviterMap = new Map((invitersResult.data ?? []).map((o) => [o.id, o.name]));

  return data.map((c) => ({
    id: c.id,
    eventId: c.event_id,
    eventTitle: eventMap.get(c.event_id) ?? "Unknown event",
    invitedByName: inviterMap.get(c.invited_by) ?? "Unknown organizer",
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
    permissionLevel: string;
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
    .select("id, organizer_id, status, permission_level, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return [];

  // Fetch organizer details separately
  const organizerIds = [...new Set(data.map((c) => c.organizer_id))];
  const { data: orgs } = await supabase
    .from("organizers")
    .select("id, name, avatar_url")
    .in("id", organizerIds);

  const orgMap = new Map((orgs ?? []).map((o) => [o.id, o]));

  return data.map((c) => ({
    id: c.id,
    organizerId: c.organizer_id,
    organizerName: orgMap.get(c.organizer_id)?.name ?? "Unknown",
    organizerPhotoUrl: orgMap.get(c.organizer_id)?.avatar_url ?? null,
    status: c.status,
    permissionLevel: c.permission_level ?? "VIEW_ONLY",
    createdAt: c.created_at,
  }));
}

// ================================================================
// Co-organizer access helpers
// ================================================================

export type CollaboratorPermission = "VIEW_ONLY" | "ANALYTICS" | "SCAN" | "FULL";

/**
 * Get the events the current user co-organizes (accepted invites only),
 * along with the permission level for each.
 */
export async function getCollaboratedEvents(
  user: CurrentUser,
): Promise<{ eventId: string; permissionLevel: CollaboratorPermission }[]> {
  const supabase = await createClient();

  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg) return [];

  const { data } = await supabase
    .from("event_collaborators")
    .select("event_id, permission_level")
    .eq("organizer_id", myOrg.id)
    .eq("status", "ACCEPTED");

  return (data ?? []).map((c) => ({
    eventId: c.event_id,
    permissionLevel: c.permission_level as CollaboratorPermission,
  }));
}

/**
 * Get the permission level for a specific event the user co-organizes.
 * Returns null if the user is not a collaborator on this event.
 */
export async function getCollaboratorPermission(
  user: CurrentUser,
  eventId: string,
): Promise<CollaboratorPermission | null> {
  const supabase = await createClient();

  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg) return null;

  const { data } = await supabase
    .from("event_collaborators")
    .select("permission_level")
    .eq("organizer_id", myOrg.id)
    .eq("event_id", eventId)
    .eq("status", "ACCEPTED")
    .maybeSingle();

  return (data?.permission_level as CollaboratorPermission) ?? null;
}

/**
 * Check if the user is either the owner or an accepted collaborator of an event.
 * Returns the access level: "OWNER", a permission level, or null.
 */
export async function getEventAccessLevel(
  user: CurrentUser,
  eventId: string,
): Promise<"OWNER" | CollaboratorPermission | null> {
  const supabase = await createClient();

  // Check ownership first
  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg) return null;

  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return null;

  if (event.organizer_id === myOrg.id) return "OWNER";

  // Check collaborator access
  const { data: collab } = await supabase
    .from("event_collaborators")
    .select("permission_level")
    .eq("organizer_id", myOrg.id)
    .eq("event_id", eventId)
    .eq("status", "ACCEPTED")
    .maybeSingle();

  return (collab?.permission_level as CollaboratorPermission) ?? null;
}

/**
 * Permission helpers — given a permission level, what can the user do?
 */
export function canViewEvent(perm: "OWNER" | CollaboratorPermission | null): boolean {
  return perm !== null;
}

export function canViewAnalytics(perm: "OWNER" | CollaboratorPermission | null): boolean {
  return perm === "OWNER" || perm === "ANALYTICS" || perm === "FULL";
}

export function canScanTickets(perm: "OWNER" | CollaboratorPermission | null): boolean {
  return perm === "OWNER" || perm === "SCAN" || perm === "FULL";
}

export function canEditEvent(perm: "OWNER" | CollaboratorPermission | null): boolean {
  return perm === "OWNER" || perm === "FULL";
}

export function canManageOrders(perm: "OWNER" | CollaboratorPermission | null): boolean {
  return perm === "OWNER" || perm === "ANALYTICS" || perm === "FULL";
}
