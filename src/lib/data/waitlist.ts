import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type { WaitlistEntry, WaitlistStatus } from "@/lib/types";

function toEntry(row: {
  id: string; event_id: string; tier_id: string; user_id: string;
  position: number; status: string; offered_at: string | null;
  expires_at: string | null; created_at: string;
}): WaitlistEntry {
  return {
    id: row.id, eventId: row.event_id, tierId: row.tier_id,
    userId: row.user_id, position: row.position,
    status: row.status as WaitlistStatus,
    offeredAt: row.offered_at, expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function joinWaitlist(
  user: CurrentUser,
  eventId: string,
  tierId: string,
): Promise<WaitlistEntry> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("waitlist")
    .select("*")
    .eq("tier_id", tierId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return toEntry(existing);

  const { data: count } = await supabase
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("tier_id", tierId)
    .eq("status", "WAITING");

  const position = ((count as unknown as { count: number } | null)?.count ?? 0) + 1;

  const { data, error } = await supabase
    .from("waitlist")
    .insert({ event_id: eventId, tier_id: tierId, user_id: user.id, position })
    .select("*")
    .single();
  if (error) throw error;
  return toEntry(data);
}

export async function leaveWaitlist(user: CurrentUser, entryId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("waitlist").delete().eq("id", entryId).eq("user_id", user.id);
}

export async function getWaitlistEntry(
  user: CurrentUser,
  tierId: string,
): Promise<WaitlistEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("waitlist")
    .select("*")
    .eq("tier_id", tierId)
    .eq("user_id", user.id)
    .maybeSingle();
  return data ? toEntry(data) : null;
}

export async function getWaitlistCount(tierId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("tier_id", tierId)
    .eq("status", "WAITING");
  return count ?? 0;
}

export async function listMyWaitlistEntries(user: CurrentUser): Promise<WaitlistEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("waitlist")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toEntry);
}
