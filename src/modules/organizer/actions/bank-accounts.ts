"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "../../shared/auth/auth";
import { getOrganizerProfile } from "../../shared/data/organizer-profile";
import { createServiceClient } from "../../shared/auth/service";

export type BankAccount = {
  id: string;
  label: string | null;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  accountType: string | null;
  isDefault: boolean;
};

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const ACCT_RE = /^\d{9,18}$/;

async function requireOrganizer() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." as const };
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return { error: "Organizer profile required." as const };
  return { organizer };
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  const ctx = await requireOrganizer();
  if ("error" in ctx) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("organizer_bank_accounts")
    .select("id, label, account_name, account_number, ifsc, account_type, is_default")
    .eq("organizer_id", ctx.organizer.id)
    .order("is_default", { ascending: false })
    .order("created_at");
  return (data ?? []).map((a) => ({
    id: a.id,
    label: a.label,
    accountName: a.account_name,
    accountNumber: a.account_number,
    ifsc: a.ifsc,
    accountType: a.account_type,
    isDefault: a.is_default,
  }));
}

export async function addBankAccountAction(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const ctx = await requireOrganizer();
  if ("error" in ctx) return { error: ctx.error ?? "Error." };

  const accountName = String(formData.get("accountName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").replace(/\s/g, "");
  const ifsc = String(formData.get("ifsc") ?? "").trim().toUpperCase();
  const label = String(formData.get("label") ?? "").trim() || null;
  const accountType = String(formData.get("accountType") ?? "").trim() || null;

  if (accountName.length < 2) return { error: "Account holder name required." };
  if (!ACCT_RE.test(accountNumber)) return { error: "Account number must be 9-18 digits." };
  if (!IFSC_RE.test(ifsc)) return { error: "Invalid IFSC (e.g. HDFC0001234)." };

  const supabase = createServiceClient();
  const existing = await supabase
    .from("organizer_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", ctx.organizer.id);

  const { error } = await supabase.from("organizer_bank_accounts").insert({
    organizer_id: ctx.organizer.id,
    label,
    account_name: accountName,
    account_number: accountNumber,
    ifsc,
    account_type: accountType,
    is_default: (existing.count ?? 0) === 0,
  });
  if (error) return { error: error.message };
  revalidatePath("/organizer");
  return { error: null };
}

export async function setDefaultBankAccountAction(accountId: string) {
  const ctx = await requireOrganizer();
  if ("error" in ctx) return { error: ctx.error ?? "Error." };
  const supabase = createServiceClient();
  await supabase
    .from("organizer_bank_accounts")
    .update({ is_default: false })
    .eq("organizer_id", ctx.organizer.id);
  const { error } = await supabase
    .from("organizer_bank_accounts")
    .update({ is_default: true })
    .eq("id", accountId)
    .eq("organizer_id", ctx.organizer.id);
  if (error) return { error: error.message };
  revalidatePath("/organizer");
  return { error: null };
}

export async function removeBankAccountAction(accountId: string) {
  const ctx = await requireOrganizer();
  if ("error" in ctx) return { error: ctx.error ?? "Error." };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("organizer_bank_accounts")
    .delete()
    .eq("id", accountId)
    .eq("organizer_id", ctx.organizer.id);
  if (error) return { error: error.message };
  revalidatePath("/organizer");
  return { error: null };
}
