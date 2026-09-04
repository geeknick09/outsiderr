"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteLegalPage, upsertLegalPage } from "@/lib/data/legal-pages";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) throw new Error("Not authorised.");
  return user;
}

export async function saveLegalPageAction(
  slug: string,
  title: string,
  content: string,
  isPublished: boolean,
): Promise<{ error: string | null }> {
  const user = await requireAdmin().catch(() => null);
  if (!user) return { error: "Not authorised." };

  if (!slug) return { error: "Slug is required." };
  if (!title) return { error: "Title is required." };
  if (!content) return { error: "Content is required." };

  try {
    await upsertLegalPage(user.id, slug, title, content, isPublished);
    revalidatePath("/admin/legal");
    revalidatePath(`/legal/${slug}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save page." };
  }
}

export async function deleteLegalPageAction(slug: string): Promise<{ error: string | null }> {
  const user = await requireAdmin().catch(() => null);
  if (!user) return { error: "Not authorised." };
  if (!slug) return { error: "Slug is required." };

  try {
    await deleteLegalPage(slug);
    revalidatePath("/admin/legal");
    revalidatePath(`/legal/${slug}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete page." };
  }
}
