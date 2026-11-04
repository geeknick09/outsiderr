"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, createClient, createServiceClient, getOrganizerProfile } from "@/modules/shared/server";
import { validate, staffRegisterSchema, staffPasswordSchema, staffIdSchema, UUID_RE, normalisePhone } from "@/modules/shared";
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
  if (organizer) {
    return { userId: user.id, ownerType: "ORGANIZER", organizerId: organizer.id };
  }
  return { error: "Not authorised — you need an organizer profile." };
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
  name?: string;
}

/** Registers a staff member with a password the organizer/admin chooses. */
export async function registerStaffAction(_prev: RegisterStaffState, formData: FormData): Promise<RegisterStaffState> {
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };

  const v = validate(staffRegisterSchema, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "").trim(),
    phone: normalisePhone(String(formData.get("phone") ?? "")),
    password: String(formData.get("password") ?? ""),
  });
  if (!v.success) return { error: v.error };
  if (v.data.phone.length !== 10) return { error: "Enter a 10-digit phone number." };

  const { error } = await createServiceClient().rpc("staff_register", {
    p_owner_type: actor.ownerType,
    p_organizer_id: actor.organizerId ?? undefined,
    p_name: v.data.name,
    p_email: v.data.email,
    p_phone: v.data.phone,
    p_password: v.data.password,
    p_actor: actor.userId,
  });
  if (error) {
    if (error.message.includes("duplicate key")) return { error: "This phone number is already registered as staff." };
    return { error: error.message };
  }
  revalidateStaff();
  return { error: null, name: v.data.name };
}

/** Organizer/admin sets a new password for a staff member. */
export async function setStaffPasswordAction(staffId: string, password: string): Promise<{ error: string | null }> {
  const v = validate(staffIdSchema, { staffId });
  if (!v.success) return { error: v.error };
  const pv = staffPasswordSchema.safeParse(password);
  if (!pv.success) return { error: pv.error.issues[0]?.message ?? "Password too short." };
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };
  const denied = await ensureOwns(actor, v.data.staffId);
  if (denied) return { error: denied };

  const { error } = await createServiceClient().rpc("staff_set_password", {
    p_staff_id: v.data.staffId,
    p_password: pv.data,
  });
  if (error) return { error: error.message };
  revalidateStaff();
  return { error: null };
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
  roles?: { canScan: boolean; canSell: boolean; isManager: boolean },
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
    p_can_scan: roles?.canScan ?? true,
    p_can_sell: roles?.canSell ?? true,
    p_is_manager: roles?.isManager ?? false,
  });
  if (error) return { error: error.message };
  revalidateStaff();
  return { error: null };
}

export interface AddEventStaffState {
  error: string | null;
  name?: string;
  /** true when the phone matched an existing staff member under this owner. */
  reused?: boolean;
}

/**
 * Event-page staff: register a new staff member (or reuse an existing one with
 * the same phone) and assign them to this event in one step. The organizer sets
 * the password; staff sign in at /scan and /box-office with phone or email +
 * password. On reuse, a non-empty password updates their credentials.
 */
export async function upsertEventStaffAction(formData: FormData): Promise<AddEventStaffState> {
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };

  const eventId = String(formData.get("eventId") ?? "");
  if (!UUID_RE.test(eventId)) return { error: "Invalid event." };

  const svc = createServiceClient();
  if (actor.ownerType === "ORGANIZER") {
    const { data: ev } = await svc.from("events").select("organizer_id").eq("id", eventId).maybeSingle();
    if (!ev || ev.organizer_id !== actor.organizerId) {
      return { error: "You can only add staff to your own events." };
    }
  }

  const v = validate(staffRegisterSchema, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "").trim(),
    phone: normalisePhone(String(formData.get("phone") ?? "")),
    password: String(formData.get("password") ?? ""),
  });
  if (!v.success) return { error: v.error };
  if (v.data.phone.length !== 10) return { error: "Enter a 10-digit phone number." };

  // Reuse an existing staff member with the same phone under this owner.
  let staffId: string;
  let reused = false;
  let query = svc
    .from("staff_members")
    .select("id, is_active")
    .eq("owner_type", actor.ownerType)
    .eq("phone", v.data.phone);
  query = actor.ownerType === "ORGANIZER" ? query.eq("organizer_id", actor.organizerId!) : query.is("organizer_id", null);
  const { data: existing } = await query.maybeSingle();

  if (existing) {
    staffId = existing.id;
    reused = true;
    if (!existing.is_active) {
      await svc.from("staff_members").update({ is_active: true }).eq("id", staffId);
    }
    // A fresh password was typed - treat it as a credential update.
    const { error: pwError } = await svc.rpc("staff_set_password", {
      p_staff_id: staffId,
      p_password: v.data.password,
    });
    if (pwError) return { error: pwError.message };
  } else {
    const { data, error } = await svc.rpc("staff_register", {
      p_owner_type: actor.ownerType,
      p_organizer_id: actor.organizerId ?? undefined,
      p_name: v.data.name,
      p_email: v.data.email,
      p_phone: v.data.phone,
      p_password: v.data.password,
      p_actor: actor.userId,
    });
    if (error) {
      if (error.message.includes("duplicate key")) return { error: "This phone number is already registered as staff." };
      return { error: error.message };
    }
    const newId = data as string | null;
    if (!newId) return { error: "Could not register the staff member." };
    staffId = newId;
  }

  const { error } = await svc.rpc("staff_set_assignment", {
    p_staff_id: staffId,
    p_event_id: eventId,
    p_active: true,
    // Role flags from the checkboxes - default to door + counter access.
    p_can_scan: formData.get("canScan") !== "false",
    p_can_sell: formData.get("canSell") !== "false",
    p_is_manager: formData.get("isManager") === "true",
  });
  if (error) return { error: error.message };

  revalidateStaff();
  revalidatePath(`/organizer/events/${eventId}`);
  return { error: null, name: v.data.name, reused };
}

/** Verify the actor owns this legacy event_staff row (organizer match). */
async function ensureOwnsLegacy(actor: Actor, staffId: string, eventId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data: row } = await svc
    .from("event_staff")
    .select("organizer_id, event_id")
    .eq("id", staffId)
    .maybeSingle();
  if (!row || row.event_id !== eventId) return "Staff member not found.";
  if (actor.ownerType === "ORGANIZER" && row.organizer_id !== actor.organizerId) return "Not authorised.";
  return null;
}

/** Update a legacy event_staff row (name/phone/email + optional password). */
export async function updateLegacyStaffAction(
  eventId: string,
  staffId: string,
  name: string,
  email: string | null,
  phone: string | null,
  password?: string,
): Promise<{ error: string | null }> {
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };
  const denied = await ensureOwnsLegacy(actor, staffId, eventId);
  if (denied) return { error: denied };
  if (!name.trim()) return { error: "Name is required." };
  if (!email?.trim() && !phone?.trim()) return { error: "Email or phone is required." };
  if (password && password.length < 6) return { error: "Password must be at least 6 characters." };

  const update: { display_name: string; email: string | null; phone: string | null; password_hash?: string } = {
    display_name: name.trim(),
    email: email?.trim() || null,
    phone: phone?.trim() || null,
  };
  if (password) {
    // Legacy rows use the old create-form scheme: "salt:sha256(salt+password)".
    const { createHash, randomBytes } = await import("crypto");
    const salt = randomBytes(16).toString("hex");
    update.password_hash = `${salt}:${createHash("sha256").update(salt + password).digest("hex")}`;
  }

  const { error } = await createServiceClient()
    .from("event_staff")
    .update(update)
    .eq("id", staffId);
  if (error) return { error: error.message };
  revalidatePath(`/organizer/events/${eventId}`);
  return { error: null };
}

/** Update a password-staff member's name/phone/email (password via staff_set_password). */
export async function updateStaffMemberAction(
  eventId: string,
  staffId: string,
  name: string,
  email: string | null,
  phone: string | null,
): Promise<{ error: string | null }> {
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };
  const denied = await ensureOwns(actor, staffId);
  if (denied) return { error: denied };
  if (!name.trim()) return { error: "Name is required." };
  if (!email?.trim() && !phone?.trim()) return { error: "Email or phone is required." };

  const { error } = await createServiceClient()
    .from("staff_members")
    .update({
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || "",
    })
    .eq("id", staffId);
  if (error) return { error: error.message };
  revalidateStaff();
  revalidatePath(`/organizer/events/${eventId}`);
  return { error: null };
}

/** Remove a legacy event_staff row from the unified roster. */
export async function removeLegacyStaffAction(
  eventId: string,
  staffId: string,
): Promise<{ error: string | null }> {
  const actor = await resolveActor();
  if ("error" in actor) return { error: actor.error };
  const denied = await ensureOwnsLegacy(actor, staffId, eventId);
  if (denied) return { error: denied };

  const { error } = await createServiceClient()
    .from("event_staff")
    .delete()
    .eq("id", staffId);
  if (error) return { error: error.message };
  revalidatePath(`/organizer/events/${eventId}`);
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
