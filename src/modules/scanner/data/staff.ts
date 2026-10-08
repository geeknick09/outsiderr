import "server-only";

import { createServiceClient } from "@/modules/shared/server";

export type StaffOwnerType = "ADMIN" | "ORGANIZER";

export interface StaffRecord {
  id: string;
  ownerType: StaffOwnerType;
  organizerId: string | null;
  name: string;
  email: string | null;
  phone: string;
  isActive: boolean;
  pinSetAt: string;
  assignedEventIds: string[];
}

export interface AssignableEvent {
  id: string;
  title: string;
  startsAt: string;
  organizerId: string;
}

/** Staff visible to one owner: all admin staff, or one organizer's staff. */
export async function listStaffRecords(ownerType: StaffOwnerType, organizerId: string | null): Promise<StaffRecord[]> {
  const svc = createServiceClient();
  let query = svc
    .from("staff_members")
    .select("id, owner_type, organizer_id, name, email, phone, is_active, pin_set_at")
    .eq("owner_type", ownerType);
  if (organizerId) query = query.eq("organizer_id", organizerId);
  const { data: staff } = await query.order("created_at", { ascending: false });
  const rows = staff ?? [];
  if (rows.length === 0) return [];

  const { data: assignments } = await svc
    .from("staff_event_assignments")
    .select("staff_id, event_id")
    .in("staff_id", rows.map((s) => s.id))
    .eq("is_active", true);
  const byStaff = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    byStaff.set(a.staff_id, [...(byStaff.get(a.staff_id) ?? []), a.event_id]);
  }

  return rows.map((s) => ({
    id: s.id,
    ownerType: s.owner_type as StaffOwnerType,
    organizerId: s.organizer_id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    isActive: s.is_active,
    pinSetAt: s.pin_set_at,
    assignedEventIds: byStaff.get(s.id) ?? [],
  }));
}

/** Events a staff member can be assigned to: admin sees all live events, organizers only their own. */
export async function listAssignableEvents(organizerId: string | null): Promise<AssignableEvent[]> {
  const svc = createServiceClient();
  let query = svc
    .from("events")
    .select("id, title, starts_at, organizer_id")
    .in("status", ["PUBLISHED", "POSTPONED"])
    .order("starts_at", { ascending: true });
  if (organizerId) query = query.eq("organizer_id", organizerId);
  const { data } = await query;
  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    organizerId: e.organizer_id,
  }));
}

/** Owner of a staff member, for authorisation checks before any change. */
export async function getStaffOwner(staffId: string): Promise<{ ownerType: StaffOwnerType; organizerId: string | null } | null> {
  const { data } = await createServiceClient()
    .from("staff_members")
    .select("owner_type, organizer_id")
    .eq("id", staffId)
    .maybeSingle();
  if (!data) return null;
  return { ownerType: data.owner_type as StaffOwnerType, organizerId: data.organizer_id };
}
