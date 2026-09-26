"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "../auth/auth";
import { getUnreadNotificationCount, listUserNotifications, markAllNotificationsRead, markNotificationRead, clearAllNotifications } from "../data/notifications";
import type { UserNotification } from "../data/notifications";

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markNotificationRead(user, notificationId);
  revalidatePath("/");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markAllNotificationsRead(user);
  revalidatePath("/");
}

/**
 * Clear (delete) every notification for the current user.
 */
export async function clearAllNotificationsAction(): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in." };
  try {
    await clearAllNotifications(user);
  } catch {
    return { error: "Could not clear notifications." };
  }
  revalidatePath("/");
  return { error: null };
}

const PAGE_SIZE = 10;

/**
 * Paginated notifications + unread count — used by the bell when the dropdown
 * opens and for "load more". Fetches PAGE_SIZE+1 rows to derive hasMore.
 */
export async function getNotificationsAction(offset = 0): Promise<{
  notifications: UserNotification[];
  unreadCount: number;
  hasMore: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { notifications: [], unreadCount: 0, hasMore: false };
  const [rows, unreadCount] = await Promise.all([
    listUserNotifications(user, PAGE_SIZE + 1, Math.max(0, offset)),
    getUnreadNotificationCount(user),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  return { notifications: rows.slice(0, PAGE_SIZE), unreadCount, hasMore };
}
