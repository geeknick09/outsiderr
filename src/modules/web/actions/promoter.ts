"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/modules/shared/server";
import { createServiceClient } from "@/modules/shared/server";
import { registerForEvent } from "@/modules/shared/server";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const ACCT_RE = /^\d{9,18}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;

export interface PromoterState {
  error: string | null;
  slug?: string;
  code?: string;
  mode?: string;
}

/** Promote an event — returns the unique share link slug or promo code. */
export async function promoteEventAction(eventId: string): Promise<PromoterState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to promote events." };
  try {
    const result = await registerForEvent(user, eventId);
    revalidatePath(`/events/${eventId}`);
    return { error: null, mode: result.mode, slug: result.slug, code: result.code };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not register as promoter." };
  }
}

/** Save payout bank/PAN details — required before any payout can be created. */
export async function savePayoutDetailsAction(
  _prev: PromoterState,
  formData: FormData,
): Promise<PromoterState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const accountName = String(formData.get("accountName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").replace(/\s/g, "");
  const ifsc = String(formData.get("ifsc") ?? "").trim().toUpperCase();
  const pan = String(formData.get("pan") ?? "").trim().toUpperCase();
  const upi = String(formData.get("upiId") ?? "").trim() || null;

  if (accountName.length < 2) return { error: "Account holder name required." };
  if (!ACCT_RE.test(accountNumber)) return { error: "Account number must be 9-18 digits." };
  if (!IFSC_RE.test(ifsc)) return { error: "Invalid IFSC." };
  if (!PAN_RE.test(pan)) return { error: "Invalid PAN." };

  const supabase = createServiceClient();
  const { data: promoter } = await supabase
    .from("promoters")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!promoter) return { error: "Promote an event first — your promoter account is created then." };

  const { error } = await supabase.from("promoters").update({
    payout_account_name: accountName,
    payout_account_number: accountNumber,
    payout_ifsc: ifsc,
    payout_pan: pan,
    upi_id: upi,
  }).eq("id", promoter.id);
  if (error) return { error: error.message };

  revalidatePath("/promoter");
  return { error: null };
}
