"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser, createClient, getOrganizerProfile } from "@/modules/shared/server";
import { validate, generatePinsSchema, revokePinSchema, rateLimit, getRateLimitIdentifier, RATE_LIMITS } from "@/modules/shared";

export interface GenerateBoxOfficePinsResult {
  error: string | null;
  success: boolean;
  pins?: { pinCode: string; staffName: string }[];
}

export async function generateBoxOfficePinsAction(
  eventId: string,
  staffNames: string[],
  role: string = "ORGANIZER",
): Promise<GenerateBoxOfficePinsResult> {
  const v = validate(generatePinsSchema, { eventId, staffNames, role });
  if (!v.success) return { error: v.error, success: false };
  const { eventId: validEventId, staffNames: validNames, role: validRole } = v.data;

  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in.", success: false };

  const organizer = await getOrganizerProfile(user);
  if (!organizer && validRole === "ORGANIZER") {
    return { error: "No organizer profile.", success: false };
  }

  // Verify organizer owns this event (for ORGANIZER role)
  if (validRole === "ORGANIZER" && organizer) {
    const supabase = await createClient();
    const { data: eventRow } = await supabase
      .from("events")
      .select("id")
      .eq("id", validEventId)
      .eq("organizer_id", organizer.id)
      .maybeSingle();
    if (!eventRow) return { error: "Event not found.", success: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_box_office_pins", {
    p_event_id: validEventId,
    p_staff_names: validNames,
    p_role: validRole,
  });

  if (error) return { error: error.message, success: false };

  const pins = ((data ?? []) as { pin_code: string; staff_name: string }[]).map((r) => ({
    pinCode: r.pin_code,
    staffName: r.staff_name,
  }));

  revalidatePath(`/organizer/events/${validEventId}`);
  return { error: null, success: true, pins };
}

/**
 * Revoke a box office PIN.
 */
export async function revokeBoxOfficePinAction(
  pinId: string,
  eventId: string,
): Promise<{ error: string | null; success: boolean }> {
  const v = validate(revokePinSchema, { pinId, eventId });
  if (!v.success) return { error: v.error, success: false };

  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in.", success: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_box_office_pin", { p_pin_id: v.data.pinId });
  if (error) return { error: error.message, success: false };

  revalidatePath(`/organizer/events/${v.data.eventId}`);
  return { error: null, success: true };
}

/**
 * Verify a box office PIN (public — no auth required, used by /organizer/box-office).
 */
