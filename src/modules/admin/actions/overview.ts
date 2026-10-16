"use server";

import { getCurrentUser, createClient } from "@/modules/shared/server";
import { getOverviewDrilldown, type DrilldownKind, type OverviewFilter } from "../data/overview";

const VALID: DrilldownKind[] = [
  "events", "orders", "boosts", "users", "new_users",
  "creators", "communities", "admins", "visitors_no_book",
];

export async function getOverviewDrilldownAction(
  kind: string,
  filter: OverviewFilter,
): Promise<{ columns: string[]; rows: string[][]; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { columns: [], rows: [], error: "Not authenticated." };
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) return { columns: [], rows: [], error: "Not authorised." };
  if (!VALID.includes(kind as DrilldownKind)) return { columns: [], rows: [], error: "Unknown stat." };
  return getOverviewDrilldown(kind as DrilldownKind, filter);
}
