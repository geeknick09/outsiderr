"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// ================================================================
// Event Subscriptions ("Update Me")
// ================================================================

/**
 * Subscribe the current user to event updates.
 * Idempotent — if already subscribed, does nothing.
 */
export async function subscribeToEventAction(eventId: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in to subscribe." };

  const supabase = await createClient();

  // Check if user already has a ticket for this event — ticket holders
  // don't need a separate subscription (they already get notifications).
  const { data: existingTicket } = await supabase
    .from("tickets")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .in("status", ["VALID", "USED"])
    .maybeSingle();

  if (existingTicket) {
    return { error: "You already have a ticket — you'll receive updates automatically." };
  }

  const { error } = await supabase
    .from("event_subscriptions")
    .upsert({ event_id: eventId, user_id: user.id }, { onConflict: "event_id,user_id" });

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

/**
 * Unsubscribe the current user from event updates.
 */
export async function unsubscribeFromEventAction(eventId: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_subscriptions")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

// ================================================================
// Organizer Follow / Unfollow
// ================================================================

/**
 * Follow an organizer.
 */
export async function followOrganizerAction(organizerId: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in to follow organizers." };

  const supabase = await createClient();

  // Prevent following yourself
  const { data: organizer } = await supabase
    .from("organizers")
    .select("owner_id")
    .eq("id", organizerId)
    .maybeSingle();

  if (organizer?.owner_id === user.id) {
    return { error: "You can't follow your own organizer profile." };
  }

  const { error } = await supabase
    .from("organizer_follows")
    .upsert({ organizer_id: organizerId, follower_id: user.id }, { onConflict: "organizer_id,follower_id" });

  if (error) return { error: error.message };

  revalidatePath(`/organizers/${organizerId}`);
  return { error: null };
}

/**
 * Unfollow an organizer.
 */
export async function unfollowOrganizerAction(organizerId: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizer_follows")
    .delete()
    .eq("organizer_id", organizerId)
    .eq("follower_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/organizers/${organizerId}`);
  return { error: null };
}

// ================================================================
// Event Collaborators (co-hosting)
// ================================================================

/**
 * Search organizers by name for collaboration invites.
 * Excludes the current user's own organizer profile.
 */
export async function searchOrganizersAction(
  query: string,
): Promise<{ error: string | null; organizers: { id: string; name: string; avatarUrl: string | null }[] }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in.", organizers: [] };

  const supabase = await createClient();

  // Get current user's organizer profile to exclude from results
  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  let queryBuilder = supabase
    .from("organizers")
    .select("id, name, photo_url")
    .ilike("name", `%${query}%`)
    .limit(10);

  if (myOrg) {
    queryBuilder = queryBuilder.neq("id", myOrg.id);
  }

  const { data, error } = await queryBuilder;

  if (error) return { error: error.message, organizers: [] };

  return {
    error: null,
    organizers: (data ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      avatarUrl: o.photo_url,
    })),
  };
}

/**
 * Invite another organizer to collaborate on an event.
 */
export async function inviteCollaboratorAction(
  eventId: string,
  organizerId: string,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in." };

  const supabase = await createClient();

  // Verify the current user owns this event
  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found." };

  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg || myOrg.id !== event.organizer_id) {
    return { error: "Only the event owner can invite collaborators." };
  }

  // Check if already invited
  const { data: existing } = await supabase
    .from("event_collaborators")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("organizer_id", organizerId)
    .maybeSingle();

  if (existing) {
    return { error: "Already invited this organizer." };
  }

  // Insert the collaboration invite
  const { error } = await supabase.from("event_collaborators").insert({
    event_id: eventId,
    organizer_id: organizerId,
    invited_by: myOrg.id,
    status: "PENDING",
  });

  if (error) return { error: error.message };

  // Send a notification to the invited organizer's owner
  const { data: invitedOrg } = await supabase
    .from("organizers")
    .select("owner_id, name")
    .eq("id", organizerId)
    .maybeSingle();

  const { data: eventDetails } = await supabase
    .from("events")
    .select("title")
    .eq("id", eventId)
    .maybeSingle();

  if (invitedOrg?.owner_id && eventDetails?.title) {
    await supabase.from("event_notifications").insert({
      event_id: eventId,
      user_id: invitedOrg.owner_id,
      type: "COLLAB_INVITE",
      message: `You've been invited to co-host "${eventDetails.title}".`,
    });
  }

  revalidatePath(`/organizer/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

/**
 * Accept a collaboration invite.
 */
export async function acceptCollaborationAction(
  eventId: string,
  collaboratorId: string,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in." };

  const supabase = await createClient();

  // Verify the current user is the invited organizer
  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg) return { error: "Organizer profile not found." };

  const { data: collab } = await supabase
    .from("event_collaborators")
    .select("id, invited_by, status")
    .eq("id", collaboratorId)
    .eq("organizer_id", myOrg.id)
    .maybeSingle();

  if (!collab) return { error: "Collaboration invite not found." };
  if (collab.status !== "PENDING") return { error: "Invite already processed." };

  const { error } = await supabase
    .from("event_collaborators")
    .update({ status: "ACCEPTED", updated_at: new Date().toISOString() })
    .eq("id", collaboratorId);

  if (error) return { error: error.message };

  // Notify the event owner that the collaboration was accepted
  const { data: eventDetails } = await supabase
    .from("events")
    .select("title, organizer_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventDetails && collab.invited_by) {
    const { data: inviterOrg } = await supabase
      .from("organizers")
      .select("owner_id")
      .eq("id", collab.invited_by)
      .maybeSingle();

    if (inviterOrg?.owner_id) {
      await supabase.from("event_notifications").insert({
        event_id: eventId,
        user_id: inviterOrg.owner_id,
        type: "COLLAB_ACCEPTED",
        message: `${myOrg.name ?? "An organizer"} accepted your collaboration invite for "${eventDetails.title}".`,
      });
    }
  }

  revalidatePath(`/organizer/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

/**
 * Reject a collaboration invite.
 */
export async function rejectCollaborationAction(
  eventId: string,
  collaboratorId: string,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in." };

  const supabase = await createClient();

  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg) return { error: "Organizer profile not found." };

  const { error } = await supabase
    .from("event_collaborators")
    .delete()
    .eq("id", collaboratorId)
    .eq("organizer_id", myOrg.id);

  if (error) return { error: error.message };

  revalidatePath(`/organizer/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

/**
 * Remove a collaborator from an event (event owner only).
 */
export async function removeCollaboratorAction(
  eventId: string,
  collaboratorId: string,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in." };

  const supabase = await createClient();

  // Verify the current user owns this event
  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found." };

  const { data: myOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!myOrg || myOrg.id !== event.organizer_id) {
    return { error: "Only the event owner can remove collaborators." };
  }

  const { error } = await supabase
    .from("event_collaborators")
    .delete()
    .eq("id", collaboratorId)
    .eq("event_id", eventId);

  if (error) return { error: error.message };

  revalidatePath(`/organizer/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { error: null };
}
