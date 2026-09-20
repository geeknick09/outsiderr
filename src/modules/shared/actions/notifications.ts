"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "../auth/auth";
import { markAllNotificationsRead, markNotificationRead } from "../data/notifications";

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
