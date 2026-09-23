"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "../auth/auth";
import { getUnreadNotificationCount, listUserNotifications, markAllNotificationsRead, markNotificationRead } from "../data/notifications";
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
 * Fresh notifications + unread count — used by the bell when the dropdown
 * opens, so a missed realtime event can't hide a notification.
 */
export async function getNotificationsAction(): Promise<{
  notifications: UserNotification[];
  unreadCount: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { notifications: [], unreadCount: 0 };
  const [notifications, unreadCount] = await Promise.all([
    listUserNotifications(user),
    getUnreadNotificationCount(user),
  ]);
  return { notifications, unreadCount };
}
