"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { upsertLegalPage } from "@/lib/data/legal-pages";

export async function saveLegalPageAction(
  slug: string,
  title: string,
  content: string,
  isPublished: boolean,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

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
