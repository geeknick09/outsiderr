import "server-only";

import { randomUUID } from "node:crypto";

import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
  if (!isSupabaseConfigured()) {
    const store = demoStore();
    const existing = store.waitlist.find(
      (w) => w.tierId === tierId && w.userId === user.id,
    );
    if (existing) return existing;
    const position =
      store.waitlist.filter((w) => w.tierId === tierId && w.status === "WAITING").length + 1;
    const entry: WaitlistEntry = {
      id: `wl-${randomUUID()}`, eventId, tierId, userId: user.id,
      position, status: "WAITING", offeredAt: null, expiresAt: null,
      createdAt: new Date().toISOString(),
    };
    store.waitlist.push(entry);
    return entry;
  }

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
  if (!isSupabaseConfigured()) {
    const store = demoStore();
    const idx = store.waitlist.findIndex((w) => w.id === entryId && w.userId === user.id);
    if (idx !== -1) store.waitlist.splice(idx, 1);
    return;
  }
  const supabase = await createClient();
  await supabase.from("waitlist").delete().eq("id", entryId).eq("user_id", user.id);
}

export async function getWaitlistEntry(
  user: CurrentUser,
  tierId: string,
): Promise<WaitlistEntry | null> {
  if (!isSupabaseConfigured()) {
    return (
      demoStore().waitlist.find((w) => w.tierId === tierId && w.userId === user.id) ?? null
    );
  }
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
  if (!isSupabaseConfigured()) {
    return demoStore().waitlist.filter(
      (w) => w.tierId === tierId && w.status === "WAITING",
    ).length;
  }
  const supabase = await createClient();
  const { count } = await supabase
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("tier_id", tierId)
    .eq("status", "WAITING");
  return count ?? 0;
}

export async function listMyWaitlistEntries(user: CurrentUser): Promise<WaitlistEntry[]> {
  if (!isSupabaseConfigured()) {
    return demoStore().waitlist.filter((w) => w.userId === user.id);
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("waitlist")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toEntry);
}
