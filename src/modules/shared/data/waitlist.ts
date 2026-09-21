import "server-only";

import { createClient } from "../auth/server";
import type { CurrentUser } from "../auth/auth";
import type { WaitlistEntry, WaitlistStatus } from "../lib/types";

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

  // Atomic RPC: locks the tier row and assigns position = max(position)+1 in one
  // serialized step, so concurrent joins can't collide. Idempotent per user+tier.
  const { data, error } = await supabase
    .rpc("join_waitlist", { p_event_id: eventId, p_tier_id: tierId });
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
 * Uses the atomic `offer_waitlist_next` RPC which locks the row with FOR UPDATE
 * to prevent race conditions when multiple tickets free up simultaneously.
 * Sets status to OFFERED with a 24h expiry. Creates an in-app notification.
 */
export async function autoOfferWaitlist(tierId: string): Promise<void> {
  const supabase = await createClient();

  // Use the atomic RPC — it locks the waitlist row with SELECT FOR UPDATE,
  // picks the first WAITING entry, marks it OFFERED with 24h expiry, and
  // returns the entry so we can create a notification.
  const { data: entry, error } = await supabase
    .rpc("offer_waitlist_next", { p_tier_id: tierId });

  if (error) {
    console.error("autoOfferWaitlist: RPC error", error);
    return;
  }
  if (!entry) return; // No one on the waitlist

  // Create an in-app notification
  const { error: notifError } = await supabase
    .from("event_notifications")
    .insert({
      event_id: entry.event_id,
      user_id: entry.user_id,
      type: "WAITLIST_OFFER",
      message: "A ticket just became available! You have 24 hours to book before it goes to the next person.",
    });

  if (notifError) {
    console.error("autoOfferWaitlist: failed to create notification", notifError);
  }
}

/**
 * Expire any OFFERED waitlist entries whose expiry has passed.
 * Re-queues them to the END of the queue (via the atomic requeue_waitlist_entry
 * RPC, which assigns position = max(position)+1 under the tier lock) and then
 * auto-offers the ticket to the next person in line.
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
    // Move back to WAITING at the END of the queue (new position = max+1)
    const { error } = await supabase
      .rpc("requeue_waitlist_entry", { p_entry_id: entry.id });
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
