"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, createClient, createServiceClient } from "@/modules/shared/server";
import { auditFinancialAction } from "@/modules/shared/server";
import { logger } from "@/modules/shared/server";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_admin === true) return user;
  throw new Error("Not authorised.");
}

type PayoutStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
type PayoutMethod = "UPI" | "NEFT" | "IMPS" | "RTGS" | "CASH" | "OTHER";

const VALID_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  PENDING: ["PROCESSING", "COMPLETED", "FAILED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

async function writePayoutLedger(
  organizerId: string,
  amountPaise: number,
  payoutId: string,
  method: string | null,
  bankRef: string | null,
  eventId?: string | null,
) {
  const service = createServiceClient();
  const { error } = await service.from("payment_ledger").insert({
    order_id: null,
    event_id: eventId ?? null,
    organizer_id: organizerId,
    type: "PAYOUT",
    // Money leaving - negative so Σ net_organizer = organizer's live balance.
    gross_amount_paise: -amountPaise,
    commission_paise: 0,
    convenience_fee_paise: 0,
    razorpay_fee_paise: 0,
    net_organizer_paise: -amountPaise,
    net_platform_paise: 0,
    razorpay_payment_id: null,
    notes: `Payout ${payoutId.slice(0, 8)} via ${method ?? "manual"}${bankRef ? ` - ${bankRef}` : ""}`,
    created_at: new Date().toISOString(),
  });
  if (error) logger.error({ payoutId, error: error.message }, "payout ledger insert failed");
}

/** Admin: schedule a payout (PENDING - money not yet sent). */
export async function adminCreatePayoutAction(
  organizerId: string,
  amountPaise: number,
  method: PayoutMethod,
  eventId?: string | null,
  notes?: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const user = await requireAdmin();
  if (!organizerId) return { success: false, error: "Pick an organizer." };
  if (!amountPaise || amountPaise <= 0) return { success: false, error: "Amount must be positive." };

  const service = createServiceClient();
  const { data, error } = await service.from("payout_records").insert({
    organizer_id: organizerId,
    event_id: eventId ?? null,
    amount_paise: amountPaise,
    status: "PENDING",
    method,
    notes: notes?.trim() || null,
    initiated_by: user.id,
    initiated_at: new Date().toISOString(),
  }).select("id").single();

  if (error) return { success: false, error: error.message };
  await auditFinancialAction(user.id, "CREATE_PAYOUT", organizerId, { amountPaise, method, eventId });
  revalidatePath("/admin/payouts");
  return { success: true, id: data?.id };
}

/** Admin: transition a payout - PENDING → PROCESSING → COMPLETED/FAILED. */
export async function adminUpdatePayoutStatusAction(
  payoutId: string,
  next: PayoutStatus,
  opts?: { bankReference?: string; failureReason?: string },
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!payoutId) return { success: false, error: "Missing payout." };

  const service = createServiceClient();
  const { data: payout } = await service
    .from("payout_records")
    .select("id, organizer_id, event_id, amount_paise, status, method, bank_reference")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return { success: false, error: "Payout not found." };
  if (!VALID_TRANSITIONS[payout.status as PayoutStatus].includes(next)) {
    return { success: false, error: `Cannot move a ${payout.status} payout to ${next}.` };
  }
  if (next === "COMPLETED" && !(opts?.bankReference ?? payout.bank_reference)) {
    return { success: false, error: "Bank/UTR reference required to complete a payout." };
  }
  if (next === "FAILED" && !opts?.failureReason?.trim()) {
    return { success: false, error: "Give a failure reason." };
  }

  const { error } = await service.from("payout_records").update({
    status: next,
    bank_reference: opts?.bankReference ?? payout.bank_reference,
    failure_reason: next === "FAILED" ? opts!.failureReason!.trim() : null,
    completed_at: next === "COMPLETED" ? new Date().toISOString() : null,
    completed_by: next === "COMPLETED" ? user.id : null,
  }).eq("id", payoutId);

  if (error) return { success: false, error: error.message };

  if (next === "COMPLETED") {
    await writePayoutLedger(
      payout.organizer_id,
      payout.amount_paise,
      payoutId,
      payout.method,
      opts?.bankReference ?? payout.bank_reference,
      payout.event_id,
    );
  }

  await auditFinancialAction(user.id, "UPDATE_PAYOUT", payoutId, {
    next,
    bankReference: opts?.bankReference,
    failureReason: opts?.failureReason,
  });
  revalidatePath("/admin/payouts");
  revalidatePath("/organizer/payments");
  return { success: true };
}
