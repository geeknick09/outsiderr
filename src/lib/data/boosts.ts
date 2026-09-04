import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type { Boost, BoostSlotPrice, BoostStatus, BoostWithEvent } from "@/lib/types";

function toBoost(row: {
  id: string; event_id: string; organizer_id: string; slot: number;
  amount_paid_paise: number; status: string; starts_at: string;
  ends_at: string; utr_reference: string | null; created_at: string;
}): Boost {
  return {
    id: row.id, eventId: row.event_id, organizerId: row.organizer_id,
    slot: row.slot, amountPaidPaise: row.amount_paid_paise,
    status: row.status as BoostStatus,
    startsAt: row.starts_at, endsAt: row.ends_at,
    utrReference: row.utr_reference, createdAt: row.created_at,
  };
}

export async function listBoostSlotPrices(): Promise<BoostSlotPrice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("boost_slot_prices")
    .select("*")
    .order("slot", { ascending: true });
  return (data ?? []).map((r) => ({ slot: r.slot, pricePaise: r.price_paise }));
}

export async function updateSlotPrice(slot: number, pricePaise: number): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("boost_slot_prices")
    .update({ price_paise: pricePaise })
    .eq("slot", slot);
}

export async function listActiveBoosts(): Promise<Boost[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("boosts")
    .select("*")
    .eq("status", "ACTIVE")
    .lte("starts_at", now)
    .gte("ends_at", now)
    .order("slot", { ascending: true });
  return (data ?? []).map(toBoost);
}

export async function listOccupiedSlots(): Promise<number[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("boosts")
    .select("slot")
    .eq("status", "ACTIVE")
    .gte("ends_at", now);
  return (data ?? []).map((r) => r.slot);
}

export interface RequestBoostInput {
  eventId: string;
  organizerId: string;
  slot: number;
  amountPaidPaise: number;
  startsAt: string;
  endsAt: string;
  utrReference: string;
}

export async function requestBoost(
  _user: CurrentUser,
  input: RequestBoostInput,
): Promise<Boost> {
  // Check slot is free before creating
  const occupied = await listOccupiedSlots();
  if (occupied.includes(input.slot)) {
    throw new Error("This slot is already taken. Pick another slot.");
  }

  const supabase = await createClient();
  // Insert boost as ACTIVE (auto-approved)
  const { data, error } = await supabase
    .from("boosts")
    .insert({
      event_id: input.eventId, organizer_id: input.organizerId,
      slot: input.slot, amount_paid_paise: input.amountPaidPaise,
      starts_at: input.startsAt, ends_at: input.endsAt,
      utr_reference: input.utrReference,
      status: "ACTIVE",
      reviewed_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  // Mark the event as featured
  await supabase
    .from("events")
    .update({ is_featured: true })
    .eq("id", input.eventId);
  return toBoost(data);
}

export async function listPendingBoosts(): Promise<BoostWithEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("boosts")
    .select("*")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true });
  if (!data) return [];

  const eventIds = [...new Set(data.map((r) => r.event_id))];
  const { data: events } = await supabase.from("events").select("id, title").in("id", eventIds);
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e.title]));

  return data.map((row) => ({
    ...toBoost(row),
    eventTitle: eventMap[row.event_id] ?? "Event",
    organizerName: "Organizer",
  }));
}

export async function approveBoost(boostId: string): Promise<void> {
  const supabase = await createClient();
  // Set boost to ACTIVE
  const { data: boost } = await supabase
    .from("boosts")
    .update({ status: "ACTIVE", reviewed_at: new Date().toISOString() })
    .eq("id", boostId)
    .select("event_id")
    .single();
  // Mark the event as featured so it shows in the FeaturedCarousel
  if (boost?.event_id) {
    await supabase
      .from("events")
      .update({ is_featured: true })
      .eq("id", boost.event_id);
  }
}

export async function rejectBoost(boostId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("boosts")
    .update({ status: "REJECTED", reviewed_at: new Date().toISOString() })
    .eq("id", boostId);
}
