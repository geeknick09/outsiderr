import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";

export interface UserNotification {
  id: string;
  eventId: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  eventTitle?: string;
}

/**
 * List all notifications for the current user, newest first.
 */
export async function listUserNotifications(user: CurrentUser): Promise<UserNotification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!data || data.length === 0) return [];

  // Fetch event titles
  const eventIds = [...new Set(data.map((n) => n.event_id))];
  const { data: events } = await supabase
    .from("events")
    .select("id, title")
    .in("id", eventIds);

  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e.title]));

  return data.map((n) => ({
    id: n.id,
    eventId: n.event_id,
    type: n.type,
    message: n.message,
    read: n.read,
    createdAt: n.created_at,
    eventTitle: eventMap[n.event_id],
  }));
}

/**
 * Get unread notification count for the current user.
 */
export async function getUnreadNotificationCount(user: CurrentUser): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("event_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);
  return count ?? 0;
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(user: CurrentUser, notificationId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllNotificationsRead(user: CurrentUser): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);
  if (error) throw new Error(error.message);
}
