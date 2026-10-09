"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/modules/shared/server";
import { createClient } from "@/modules/shared/auth/server";

/** Owner removes a promoter from their event — earned commission is kept. */
export async function removeEventPromoterAction(eventId: string, promoterId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("organizer_remove_promoter", {
    p_promoter_id: promoterId,
    p_event_id: eventId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/organizer/events/${eventId}`);
  return { error: null };
}
