"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getOrganizerProfile } from "@/modules/shared/server";
import { createServiceClient } from "@/modules/shared/server";

/** Owner removes a promoter from their event - earned commission is kept. */
export async function removeEventPromoterAction(eventId: string, promoterId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  // Verify the caller owns this event
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "No organizer profile." };
  const svc = createServiceClient();
  const { data: ev } = await svc.from("events").select("organizer_id").eq("id", eventId).maybeSingle();
  if (!ev || ev.organizer_id !== organizer.id) return { error: "You can only manage your own events." };

  // Deactivate all links and promo codes for this promoter on this event.
  // Earned commission is preserved — only new sales stop.
  const [linksRes, codesRes] = await Promise.all([
    svc.from("promoter_links").update({ is_active: false }).eq("promoter_id", promoterId).eq("event_id", eventId),
    svc.from("promoter_promo_codes").update({ is_active: false }).eq("promoter_id", promoterId).eq("event_id", eventId),
  ]);
  if (linksRes.error && codesRes.error) return { error: linksRes.error.message };

  revalidatePath(`/organizer/events/${eventId}`);
  return { error: null };
}
