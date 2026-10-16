"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser, createClient } from "@/modules/shared/server";

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

const taskSchema = z.object({
  title: z.string().trim().min(2, "Give the task a title.").max(140),
  kind: z.enum(["REGISTRATION", "FILING", "POLICY_REVIEW", "TASK"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function addComplianceTaskAction(input: {
  title: string;
  kind: string;
  dueDate?: string;
  notes?: string;
}): Promise<{ error?: string }> {
  const user = await requireAdmin();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const supabase = await createClient();
  const { error } = await supabase.from("compliance_tasks").insert({
    title: parsed.data.title,
    kind: parsed.data.kind,
    due_date: parsed.data.dueDate || null,
    notes: parsed.data.notes || null,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/compliance");
  return {};
}

export async function toggleComplianceTaskAction(
  taskId: string,
  done: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("compliance_tasks")
    .update({ status: done ? "DONE" : "OPEN", done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/admin/compliance");
  return {};
}

export async function deleteComplianceTaskAction(taskId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("compliance_tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/admin/compliance");
  return {};
}
