"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "../auth/client";
import { getCurrentUser } from "../auth/auth";
import { logger } from "../lib/logger";

/**
 * Require the current user to be an admin.
 * Throws if not authenticated or not an admin.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_admin !== true) {
    throw new Error("Not authorised. Admin access required.");
  }

  return user;
}

/**
 * Submit a review for an event.
 *
 * Requirements:
 * - User must be logged in
 * - User must have a USED ticket (checked in at the door)
 * - User must not have already reviewed this event
 * - Rating must be 1-5
 * - Review text is optional (max 1000 chars)
 */
export async function submitReview(
  eventId: string,
  rating: number,
  reviewText: string | null,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in to review." };
  }

  // Validate rating
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: "Rating must be between 1 and 5." };
  }

  // Validate review text
  if (reviewText && reviewText.length > 1000) {
    return { success: false, error: "Review must be 1000 characters or less." };
  }

  const supabase = await createClient();

  // Verify the user has a USED ticket for this event
  const { data: usedTicket } = await supabase
    .from("tickets")
    .select(
      `
      id,
      orders!inner(user_id)
    `,
    )
    .eq("event_id", eventId)
    .eq("status", "USED")
    .eq("orders.user_id", user.id)
    .limit(1)
    .single();

  if (!usedTicket) {
    return { success: false, error: "You must check in at the event before reviewing." };
  }

  // Get the organizer_id for this event
  const { data: event } = await supabase
    .from("events")
    .select("organizer_id, title")
    .eq("id", eventId)
    .single();

  if (!event) {
    return { success: false, error: "Event not found." };
  }

  // Insert the review (RLS will enforce the unique + checked-in constraint)
  const { error } = await supabase.from("event_reviews").insert({
    event_id: eventId,
    organizer_id: event.organizer_id,
    user_id: user.id,
    rating,
    review_text: reviewText?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      // unique_violation — already reviewed
      return { success: false, error: "You have already reviewed this event." };
    }
    logger.error({ error: error.message, eventId, userId: user.id }, "review: insert failed");
    return { success: false, error: "Failed to submit review. Please try again." };
  }

  // Revalidate the organizer profile page so the new review shows
  revalidatePath(`/organizers/${event.organizer_id}`);
  revalidatePath("/tickets");

  return { success: true };
}

/**
 * Delete a user's own review.
 */
export async function deleteReview(
  reviewId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  // Get the review to find the organizer_id for cache invalidation
  const { data: review } = await supabase
    .from("event_reviews")
    .select("organizer_id")
    .eq("id", reviewId)
    .eq("user_id", user.id)
    .single();

  if (!review) {
    return { success: false, error: "Review not found." };
  }

  const { error } = await supabase
    .from("event_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("user_id", user.id);

  if (error) {
    logger.error({ error: error.message, reviewId }, "review: delete failed");
    return { success: false, error: "Failed to delete review." };
  }

  revalidatePath(`/organizers/${review.organizer_id}`);
  revalidatePath("/tickets");

  return { success: true };
}

/**
 * Admin-only: delete any review (moderation).
 * Organizers cannot delete reviews — only the review author or an admin can.
 */
export async function adminDeleteReview(
  reviewId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorised." };
  }

  const supabase = await createClient();

  // Get the review to find the organizer_id for cache invalidation
  const { data: review } = await supabase
    .from("event_reviews")
    .select("organizer_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) {
    return { success: false, error: "Review not found." };
  }

  const { error } = await supabase
    .from("event_reviews")
    .delete()
    .eq("id", reviewId);

  if (error) {
    logger.error({ error: error.message, reviewId }, "admin: review delete failed");
    return { success: false, error: "Failed to delete review." };
  }

  revalidatePath(`/organizers/${review.organizer_id}`);
  revalidatePath("/tickets");

  return { success: true };
}
