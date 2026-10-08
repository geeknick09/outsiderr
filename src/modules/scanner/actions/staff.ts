"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, createClient, createServiceClient, getOrganizerProfile } from "@/modules/shared/server";
import { validate, staffRegisterSchema, staffIdSchema, UUID_RE, normalisePhone } from "@/modules/shared";
import { getStaffOwner, type StaffOwnerType } from "../data/staff";

interface Actor {
  userId: string;
  ownerType: StaffOwnerType;
  organizerId: string | null;
}

/** Admins manage ADMIN staff; approved organizers manage their own ORGANIZER staff. */
async function resolveActor(): Promise<Actor | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in." };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_admin === true) return { userId: user.id, ownerType: "ADMIN", organizerId: null };

  const organizer = await getOrganizerProfile(user);
  if (organizer && organizer.kycStatus === "APPROVED") {
    return { userId: user.id, ownerType: "ORGANIZER", organizerId: organizer.id };
  }
  return { error: "Not authorised." };
}

/** Returns an error unless the actor owns this staff member. */
async function ensureOwns(actor: Actor, staffId: string): Promise<string | null> {
  const owner = await getStaffOwner(staffId);
  if (!owner) return "Staff member not found.";
  if (owner.ownerType !== actor.ownerType) return "Not authorised.";
  if (actor.ownerType === "ORGANIZER" && owner.organizerId !== actor.organizerId) return "Not authorised.";
  return null;
}


function revalidateStaff() {
  revalidatePath("/admin/box-office-staff");
  revalidatePath("/organizer/staff");
}

export interface RegisterStaffState {
  error: string | null;
  pin?: string;
  name?: string;
}

/** Registers a staff member. The PIN is returned once and never stored in plaintext. */
export async function registerStaffAction(_prev: RegisterStaffState, formData: FormData): Promise<RegisterStaffState> {
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };

  const v = validate(staffRegisterSchema, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "").trim(),
    phone: normalisePhone(String(formData.get("phone") ?? "")),
  });
  if (!v.success) return { error: v.error };
  if (v.data.phone.length !== 10) return { error: "Enter a 10-digit phone number." };

  const { data, error } = await createServiceClient().rpc("staff_register", {
    p_owner_type: actor.ownerType,
    p_organizer_id: actor.organizerId ?? undefined,
    p_name: v.data.name,
    p_email: v.data.email,
    p_phone: v.data.phone,
    p_actor: actor.userId,
  });
  if (error) {
    if (error.message.includes("duplicate key")) return { error: "This phone number is already registered as staff." };
    return { error: error.message };
  }
  revalidateStaff();
  return { error: null, pin: data?.[0]?.pin, name: v.data.name };
}

export async function resetStaffPinAction(staffId: string): Promise<{ error: string | null; pin?: string }> {
  const v = validate(staffIdSchema, { staffId });
  if (!v.success) return { error: v.error };
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };
  const denied = await ensureOwns(actor, v.data.staffId);
  if (denied) return { error: denied };

  const { data: pin, error } = await createServiceClient().rpc("staff_reset_pin", { p_staff_id: v.data.staffId });
  if (error) return { error: error.message };
  revalidateStaff();
  return { error: null, pin: pin ?? undefined };
}

export async function setStaffActiveAction(staffId: string, active: boolean): Promise<{ error: string | null }> {
  const v = validate(staffIdSchema, { staffId });
  if (!v.success) return { error: v.error };
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };
  const denied = await ensureOwns(actor, v.data.staffId);
  if (denied) return { error: denied };

  const { error } = await createServiceClient()
    .from("staff_members")
    .update({ is_active: active })
    .eq("id", v.data.staffId);
  if (error) return { error: error.message };
  revalidateStaff();
  return { error: null };
}

export async function setStaffAssignmentAction(
  staffId: string,
  eventId: string,
  active: boolean,
): Promise<{ error: string | null }> {
  const v = validate(staffIdSchema, { staffId });
  if (!v.success) return { error: v.error };
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };
  const denied = await ensureOwns(actor, v.data.staffId);
  if (denied) return { error: denied };

  // The RPC re-checks that organizer staff only get their own organizer's events.
  const { error } = await createServiceClient().rpc("staff_set_assignment", {
    p_staff_id: v.data.staffId,
    p_event_id: eventId,
    p_active: active,
  });
  if (error) return { error: error.message };
  revalidateStaff();
  return { error: null };
}

/** Organizer/admin confirms cash handed over. The amount is computed on the server. */
export async function confirmCashHandoverAction(
  staffId: string,
  eventId: string,
): Promise<{ error: string | null; amountPaise?: number }> {
  const v = validate(staffIdSchema, { staffId });
  if (!v.success) return { error: v.error };
  if (!UUID_RE.test(eventId)) return { error: "Invalid event." };
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };
  const denied = await ensureOwns(actor, v.data.staffId);
  if (denied) return { error: denied };

  const { data, error } = await createServiceClient().rpc("confirm_cash_handover", {
    p_staff_id: v.data.staffId,
    p_event_id: eventId,
    p_actor: actor.userId,
  });
  if (error) return { error: error.message };
  revalidateStaff();
  return { error: null, amountPaise: Number(data) };
}
