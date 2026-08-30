import "server-only";

import { randomUUID } from "node:crypto";

import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
  if (!isSupabaseConfigured()) {
    return [
      { slot: 1, pricePaise: 500000 }, { slot: 2, pricePaise: 400000 },
      { slot: 3, pricePaise: 300000 }, { slot: 4, pricePaise: 250000 },
      { slot: 5, pricePaise: 200000 }, { slot: 6, pricePaise: 175000 },
      { slot: 7, pricePaise: 150000 }, { slot: 8, pricePaise: 125000 },
      { slot: 9, pricePaise: 100000 }, { slot: 10, pricePaise: 75000 },
    ];
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("boost_slot_prices")
    .select("*")
    .order("slot", { ascending: true });
  return (data ?? []).map((r) => ({ slot: r.slot, pricePaise: r.price_paise }));
}

export async function listActiveBoosts(): Promise<Boost[]> {
  if (!isSupabaseConfigured()) {
    const now = new Date().toISOString();
    return demoStore().boosts.filter(
      (b) => b.status === "ACTIVE" && b.startsAt <= now && b.endsAt >= now,
    ).sort((a, b) => a.slot - b.slot);
  }
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
  if (!isSupabaseConfigured()) {
    const now = new Date().toISOString();
    return demoStore().boosts
      .filter((b) => b.status === "ACTIVE" && b.endsAt >= now)
      .map((b) => b.slot);
  }
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
  if (!isSupabaseConfigured()) {
    const boost: Boost = {
      id: `boost-${randomUUID()}`, ...input,
      status: "PENDING", utrReference: input.utrReference, createdAt: new Date().toISOString(),
    };
    demoStore().boosts.push(boost);
    return boost;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boosts")
    .insert({
      event_id: input.eventId, organizer_id: input.organizerId,
      slot: input.slot, amount_paid_paise: input.amountPaidPaise,
      starts_at: input.startsAt, ends_at: input.endsAt,
      utr_reference: input.utrReference,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toBoost(data);
}

export async function listPendingBoosts(): Promise<BoostWithEvent[]> {
  if (!isSupabaseConfigured()) {
    return demoStore().boosts
      .filter((b) => b.status === "PENDING")
      .map((b) => ({
        ...b,
        eventTitle: demoStore().events.find((e) => e.id === b.eventId)?.title ?? "Event",
        organizerName: "Demo Organizer",
      }));
  }
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
  if (!isSupabaseConfigured()) {
    const boost = demoStore().boosts.find((b) => b.id === boostId);
    if (boost) { boost.status = "ACTIVE"; }
    return;
  }
  const supabase = await createClient();
  await supabase
    .from("boosts")
    .update({ status: "ACTIVE", reviewed_at: new Date().toISOString() })
    .eq("id", boostId);
}

export async function rejectBoost(boostId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const boost = demoStore().boosts.find((b) => b.id === boostId);
    if (boost) { boost.status = "REJECTED"; }
    return;
  }
  const supabase = await createClient();
  await supabase
    .from("boosts")
    .update({ status: "REJECTED", reviewed_at: new Date().toISOString() })
    .eq("id", boostId);
}
