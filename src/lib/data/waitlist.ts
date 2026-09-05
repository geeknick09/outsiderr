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

/**
 * When a ticket becomes available (e.g. order rejected/cancelled, inventory restocked),
 * auto-offer it to the first WAITING user on the waitlist for that tier.
 * Sets status to OFFERED with a 24h expiry. Creates an in-app notification.
 */
export async function autoOfferWaitlist(tierId: string): Promise<void> {
  const supabase = await createClient();

  // Find the first WAITING entry for this tier, ordered by position
  const { data: next } = await supabase
    .from("waitlist")
    .select("*")
    .eq("tier_id", tierId)
    .eq("status", "WAITING")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) return; // No one on the waitlist

  // Mark as OFFERED with 24h expiry
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: updateError } = await supabase
    .from("waitlist")
    .update({ status: "OFFERED", offered_at: new Date().toISOString(), expires_at: expiresAt })
    .eq("id", next.id);

  if (updateError) {
    console.error("autoOfferWaitlist: failed to update entry", updateError);
    return;
  }

  // Create an in-app notification
  const { error: notifError } = await supabase
    .from("event_notifications")
    .insert({
      event_id: next.event_id,
      user_id: next.user_id,
      type: "WAITLIST_OFFER",
      message: "A ticket just became available! You have 24 hours to book before it goes to the next person.",
    });

  if (notifError) {
    console.error("autoOfferWaitlist: failed to create notification", notifError);
  }
}

/**
 * Expire any OFFERED waitlist entries whose expiry has passed.
 * Moves them back to WAITING (at the end of the queue) and triggers auto-offer for the next person.
 */
export async function expireWaitlistOffers(): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Find expired OFFERED entries
  const { data: expired } = await supabase
    .from("waitlist")
    .select("id, tier_id")
    .eq("status", "OFFERED")
    .lt("expires_at", now);

  if (!expired || expired.length === 0) return;

  for (const entry of expired) {
    // Move back to WAITING (they keep their position but go to end)
    const { error } = await supabase
      .from("waitlist")
      .update({ status: "WAITING", offered_at: null, expires_at: null })
      .eq("id", entry.id);
    if (error) continue;

    // Auto-offer to the next person
    await autoOfferWaitlist(entry.tier_id);
  }
}

/**
 * List all waitlist entries for an event (for organizer view).
 * Includes user name and tier name.
 */
export async function listEventWaitlist(
  eventId: string,
): Promise<{
  id: string;
  tierId: string;
  tierName: string;
  userId: string;
  userName: string;
  position: number;
  status: WaitlistStatus;
  createdAt: string;
  offeredAt: string | null;
  expiresAt: string | null;
}[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("waitlist")
    .select("*")
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  if (!data || data.length === 0) return [];

  // Fetch user names
  const userIds = [...new Set(data.map((w) => w.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown user"]));

  // Fetch tier names
  const tierIds = [...new Set(data.map((w) => w.tier_id))];
  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("id, name")
    .in("id", tierIds);
  const tierMap = Object.fromEntries((tiers ?? []).map((t) => [t.id, t.name]));

  return data.map((w) => ({
    id: w.id,
    tierId: w.tier_id,
    tierName: tierMap[w.tier_id] ?? "Unknown tier",
    userId: w.user_id,
    userName: profileMap[w.user_id] ?? "Unknown user",
    position: w.position,
    status: w.status as WaitlistStatus,
    createdAt: w.created_at,
    offeredAt: w.offered_at,
    expiresAt: w.expires_at,
  }));
}
