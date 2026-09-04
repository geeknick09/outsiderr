import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { PlatformSetting } from "@/lib/types";

// ---------------------------------------------------------------- defaults
// Used as fallbacks when a setting is not found in the store or DB.
const FALLBACKS: Record<string, unknown> = {
  platform_fee_bps: 500,
  cancellation_charge_percent: 20,
  postponement_charge_percent: 10,
  door_staff_pricing: { "1": 1500, "2": 2500, "3": 3500, "4": 5000, "5": 6500 },
  door_staff_max: 5,
  door_staff_available: 10,
  boost_slot_prices: { carousel_1: 1000, carousel_2: 750, carousel_3: 500 },
  max_tickets_per_order: 1,
  terms_version: "organizer-v1.0",
  venue_announcement_deadline_hours: 48,
  organizer_whatsapp_number: "7980085212",
  hero_boost_enabled: true,
  hero_boost_price: 99900,
  hero_boost_duration_days: 7,
  hero_rotation_interval_minutes: 30,
  hero_max_visible_events: 7,
  tagline_header: "Find what's happening outside the mainstream.",
  tagline_subheader: "Discover raw events happening today near you.",
  tagline_footer: "Cyphers, battles, stunts, skates, jams & real communities. Discover raw events happening today near you.",
  commission_tier1_max_paise: 50000,
  commission_tier2_max_paise: 300000,
  commission_tier1_bps: 1000,
  commission_tier2_bps: 700,
  commission_tier3_bps: 500,
};

// ---------------------------------------------------------------- helpers
function parseValue(raw: unknown): string | number | boolean | Record<string, number> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as string | number | boolean | Record<string, number>;
    } catch {
      return raw;
    }
  }
  return raw as string | number | boolean | Record<string, number>;
}

// ---------------------------------------------------------------- cached getters
// React cache() deduplicates calls within the same request.
export const getSetting = cache(async (key: string): Promise<string | number | boolean | Record<string, number> | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data) return (FALLBACKS[key] as string | number | boolean | Record<string, number>) ?? null;
  return parseValue(data.value);
});

export async function getSettingInt(key: string): Promise<number> {
  const val = await getSetting(key);
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseInt(val, 10);
  return 0;
}

export async function getSettingString(key: string): Promise<string> {
  const val = await getSetting(key);
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return "";
}

export async function getSettingJSON<T>(key: string): Promise<T | null> {
  const val = await getSetting(key);
  return (val as T) ?? null;
}

// ---------------------------------------------------------------- admin CRUD
export async function getAllSettings(): Promise<PlatformSetting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("*")
    .order("key", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    key: row.key,
    value: parseValue(row.value),
    description: row.description,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export async function updateSetting(
  userId: string,
  key: string,
  value: string | number | boolean | Record<string, number>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      value: typeof value === "object" ? JSON.stringify(value) : value,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("key", key);
  if (error) throw error;
}

// ---------------------------------------------------------------- typed convenience getters
export async function getPlatformFeeBps(): Promise<number> {
  return getSettingInt("platform_fee_bps");
}

export async function getCancellationChargePercent(): Promise<number> {
  return getSettingInt("cancellation_charge_percent");
}

export async function getPostponementChargePercent(): Promise<number> {
  return getSettingInt("postponement_charge_percent");
}

export async function getDoorStaffPricing(): Promise<Record<string, number>> {
  return (await getSettingJSON<Record<string, number>>("door_staff_pricing")) ?? { "1": 1500, "2": 2500, "3": 3500 };
}

export async function getDoorStaffMax(): Promise<number> {
  return getSettingInt("door_staff_max");
}

export async function getTermsVersion(): Promise<string> {
  return getSettingString("terms_version");
}

export async function getDoorStaffAvailable(): Promise<number> {
  return getSettingInt("door_staff_available");
}

export async function getOrganizerWhatsappNumber(): Promise<string> {
  return getSettingString("organizer_whatsapp_number");
}

export async function getHeroBoostEnabled(): Promise<boolean> {
  const val = await getSetting("hero_boost_enabled");
  return val === true || val === "true";
}

export async function getHeroBoostPrice(): Promise<number> {
  return getSettingInt("hero_boost_price");
}

export async function getHeroBoostDurationDays(): Promise<number> {
  return getSettingInt("hero_boost_duration_days");
}

export async function getHeroRotationIntervalMinutes(): Promise<number> {
  return getSettingInt("hero_rotation_interval_minutes");
}

export async function getHeroMaxVisibleEvents(): Promise<number> {
  return getSettingInt("hero_max_visible_events");
}

export async function getTaglineHeader(): Promise<string> {
  return getSettingString("tagline_header");
}

export async function getTaglineSubheader(): Promise<string> {
  return getSettingString("tagline_subheader");
}

export async function getTaglineFooter(): Promise<string> {
  return getSettingString("tagline_footer");
}

// ---------------------------------------------------------------- commission tiers
export interface FeeTiers {
  tier1MaxPaise: number;
  tier2MaxPaise: number;
  tier1Bps: number;
  tier2Bps: number;
  tier3Bps: number;
}

export async function getFeeTiers(): Promise<FeeTiers> {
  const [tier1Max, tier2Max, tier1Bps, tier2Bps, tier3Bps] = await Promise.all([
    getSettingInt("commission_tier1_max_paise"),
    getSettingInt("commission_tier2_max_paise"),
    getSettingInt("commission_tier1_bps"),
    getSettingInt("commission_tier2_bps"),
    getSettingInt("commission_tier3_bps"),
  ]);
  return {
    tier1MaxPaise: tier1Max || 50000,
    tier2MaxPaise: tier2Max || 300000,
    tier1Bps: tier1Bps || 1000,
    tier2Bps: tier2Bps || 700,
    tier3Bps: tier3Bps || 500,
  };
}
