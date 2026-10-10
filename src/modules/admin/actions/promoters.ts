"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/modules/shared/server";
import { createClient } from "@/modules/shared/auth/server";
import { createServiceClient } from "@/modules/shared/auth/service";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (profile?.is_admin === true) return user;
  return null;
}

export async function togglePromoterBlockedAction(promoterId: string, blocked: boolean) {
  const user = await requireAdmin();
  if (!user) return { error: "Admin only." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_promoter_blocked", {
    p_promoter_id: promoterId,
    p_blocked: blocked,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/promoters");
  return { error: null };
}

/** Create a promoter payout - snapshots bank details, marks earnings PAID. */
export async function createPromoterPayoutAction(promoterId: string) {
  const user = await requireAdmin();
  if (!user) return { error: "Admin only." };
  const supabase = createServiceClient();

  const { data: promoter } = await supabase.from("promoters").select("*").eq("id", promoterId).single();
  if (!promoter) return { error: "Promoter not found." };
  if (!promoter.payout_account_number || !promoter.payout_ifsc) {
    return { error: "Promoter hasn't added payout bank details yet." };
  }

  const { data: payablePaise, error } = await supabase.rpc("promoter_payable_paise", { p_promoter_id: promoterId });
  if (error) return { error: error.message };
  const { data: minRow } = await supabase.from("platform_settings").select("value").eq("key", "promoter_min_payout_paise").single();
  const minPaise = Number(minRow?.value ?? 100000);
  if (!payablePaise || payablePaise < minPaise) {
    return { error: `Payable balance below minimum (${Math.round(minPaise / 100)} INR).` };
  }

  const { error: payoutErr } = await supabase.from("promoter_payouts").insert({
    promoter_id: promoterId,
    amount_paise: payablePaise,
    status: "PENDING",
    payout_snapshot: {
      account_name: promoter.payout_account_name,
      account_number: promoter.payout_account_number,
      ifsc: promoter.payout_ifsc,
      pan: promoter.payout_pan,
      upi: promoter.upi_id,
    },
  });
  if (payoutErr) return { error: payoutErr.message };
  revalidatePath("/admin/promoters");
  return { error: null };
}

/** Mark a pending payout done (or failed) once the bank transfer lands. */
export async function completePromoterPayoutAction(
  payoutId: string,
  outcome: "COMPLETED" | "FAILED",
  bankReference?: string,
) {
  const user = await requireAdmin();
  if (!user) return { error: "Admin only." };
  const supabase = createServiceClient();

  const { data: payout } = await supabase.from("promoter_payouts").select("*").eq("id", payoutId).single();
  if (!payout) return { error: "Payout not found." };
  if (payout.status !== "PENDING" && payout.status !== "PROCESSING") {
    return { error: "Payout already settled." };
  }

  const { error } = await supabase.from("promoter_payouts").update({
    status: outcome,
    bank_reference: bankReference ?? payout.bank_reference,
    completed_at: outcome === "COMPLETED" ? new Date().toISOString() : null,
  }).eq("id", payoutId);
  if (error) return { error: error.message };

  if (outcome === "COMPLETED") {
    // mark all unpaid earnings of this promoter as paid up to the amount
    const { data: earnings } = await supabase
      .from("promoter_earnings")
      .select("id, amount_paise, reversed_paise")
      .eq("promoter_id", payout.promoter_id)
      .eq("status", "EARNED")
      .order("created_at");
    let remaining = payout.amount_paise;
    const now = new Date().toISOString();
    for (const e of earnings ?? []) {
      const net = e.amount_paise - e.reversed_paise;
      if (net <= 0 || remaining <= 0) continue;
      await supabase.from("promoter_earnings")
        .update({ status: "PAID", paid_at: now, payout_id: payoutId })
        .eq("id", e.id);
      remaining -= net;
    }
  }
  revalidatePath("/admin/promoters");
  return { error: null };
}
