import "server-only";

import { createClient } from "../auth/server";
import type { EventReview, OrganizerRating } from "../lib/types";

/**
 * Get all reviews for a specific event.
 * Includes the reviewer's name/avatar.
 * Ordered by most recent first.
 */
export async function getEventReviews(
  eventId: string,
): Promise<EventReview[]> {
  const supabase = await createClient();

  const { data: reviews, error } = await supabase
    .from("event_reviews")
    .select(
      `
      id,
      event_id,
      organizer_id,
      user_id,
      rating,
      review_text,
      created_at,
      events!inner(title),
      profiles!inner(full_name, avatar_url)
    `,
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error || !reviews) {
    return [];
  }

  return reviews.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    eventId: r.event_id as string,
    eventTitle: (r.events as { title: string }).title,
    organizerId: r.organizer_id as string,
    userId: r.user_id as string,
    userName: (r.profiles as { full_name: string | null }).full_name,
    userAvatarUrl: (r.profiles as { avatar_url: string | null }).avatar_url,
    rating: r.rating as number,
    reviewText: (r.review_text as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/**
 * Get all reviews for an organizer's public profile.
 * Includes the reviewer's name/avatar and the event title.
 * Ordered by most recent first.
 */
export async function getOrganizerReviews(
  organizerId: string,
): Promise<EventReview[]> {
  const supabase = await createClient();

  // Fetch reviews with a join to get event title + user profile
  const { data: reviews, error } = await supabase
    .from("event_reviews")
    .select(
      `
      id,
      event_id,
      organizer_id,
      user_id,
      rating,
      review_text,
      created_at,
      events!inner(title),
      profiles!inner(full_name, avatar_url)
    `,
    )
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: false });

  if (error || !reviews) {
    return [];
  }

  return reviews.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    eventId: r.event_id as string,
    eventTitle: (r.events as { title: string }).title,
    organizerId: r.organizer_id as string,
    userId: r.user_id as string,
    userName: (r.profiles as { full_name: string | null }).full_name,
    userAvatarUrl: (r.profiles as { avatar_url: string | null }).avatar_url,
    rating: r.rating as number,
    reviewText: (r.review_text as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/**
 * Get aggregate rating for an organizer.
 * Returns average rating, total count, and star distribution.
 */
export async function getOrganizerRating(
  organizerId: string,
): Promise<OrganizerRating> {
  const supabase = await createClient();

  const { data: reviews } = await supabase
    .from("event_reviews")
    .select("rating")
    .eq("organizer_id", organizerId);

  if (!reviews || reviews.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      distribution: [0, 0, 0, 0, 0],
    };
  }

  const total = reviews.length;
  const sum = reviews.reduce((acc: number, r: { rating: number }) => acc + r.rating, 0);
  const average = total > 0 ? sum / total : 0;

  const distribution = [0, 0, 0, 0, 0];
  for (const r of reviews) {
    const rating = (r as { rating: number }).rating;
    if (rating >= 1 && rating <= 5) {
      distribution[rating - 1]++;
    }
  }

  return {
    averageRating: Math.round(average * 10) / 10, // 1 decimal place
    totalReviews: total,
    distribution,
  };
}

/**
 * Check if the current user can review a specific event.
 * They must have a USED ticket (checked in) and not have already reviewed.
 */
export async function canUserReviewEvent(
  userId: string,
  eventId: string,
): Promise<{ canReview: boolean; reason: string | null }> {
  const supabase = await createClient();

  // Check for a USED ticket (checked in) via join on orders
  const { data: usedTicket } = await supabase
    .from("tickets")
    .select(
      `
      id,
      status,
      orders!inner(user_id)
    `,
    )
    .eq("event_id", eventId)
    .eq("status", "USED")
    .eq("orders.user_id", userId)
    .limit(1)
    .single();

  if (!usedTicket) {
    return { canReview: false, reason: "You must check in at the event before reviewing." };
  }

  // Check if already reviewed
  const { data: existing } = await supabase
    .from("event_reviews")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (existing) {
    return { canReview: false, reason: "You have already reviewed this event." };
  }

  return { canReview: true, reason: null };
}

/**
 * Get events the current user has checked into but hasn't reviewed yet.
 * Only returns past events (event has ended).
 */
export async function getReviewableEvents(
  userId: string,
): Promise<Array<{ eventId: string; eventTitle: string; eventStartsAt: string; organizerId: string }>> {
  const supabase = await createClient();

  // Find USED tickets for this user via join on orders
  const { data: tickets } = await supabase
    .from("tickets")
    .select(
      `
      id,
      event_id,
      events!inner(id, title, starts_at, organizer_id, status),
      orders!inner(user_id)
    `,
    )
    .eq("status", "USED")
    .eq("orders.user_id", userId)
    .then((r) => r);

  if (!tickets || tickets.length === 0) return [];

  // Filter to past events only
  const now = new Date().toISOString();
  const pastTickets = tickets.filter((t: Record<string, unknown>) => {
    const event = t.events as { starts_at: string; status: string };
    return event.starts_at < now && event.status !== "CANCELLED";
  });

  if (pastTickets.length === 0) return [];

  // Get existing reviews for these events
  const eventIds = pastTickets.map((t: Record<string, unknown>) => t.event_id as string);
  const { data: existingReviews } = await supabase
    .from("event_reviews")
    .select("event_id")
    .eq("user_id", userId)
    .in("event_id", eventIds);

  const reviewedEventIds = new Set((existingReviews ?? []).map((r: { event_id: string }) => r.event_id));

  return pastTickets
    .filter((t: Record<string, unknown>) => !reviewedEventIds.has(t.event_id as string))
    .map((t: Record<string, unknown>) => {
      const event = t.events as { id: string; title: string; starts_at: string; organizer_id: string };
      return {
        eventId: event.id,
        eventTitle: event.title,
        eventStartsAt: event.starts_at,
        organizerId: event.organizer_id,
      };
    });
}
