import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface LegalPage {
  slug: string;
  title: string;
  content: string;
  version: number;
  isPublished: boolean;
  updatedAt: string;
}

export async function listLegalPages(): Promise<LegalPage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("legal_pages")
    .select("*")
    .order("slug", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    slug: row.slug,
    title: row.title,
    content: row.content,
    version: row.version,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
  }));
}

export async function getLegalPage(slug: string): Promise<LegalPage | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("legal_pages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    slug: data.slug,
    title: data.title,
    content: data.content,
    version: data.version,
    isPublished: data.is_published,
    updatedAt: data.updated_at,
  };
}

export async function upsertLegalPage(
  userId: string,
  slug: string,
  title: string,
  content: string,
  isPublished: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("legal_pages")
    .upsert({
      slug,
      title,
      content,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });
  if (error) throw error;
}

export async function deleteLegalPage(slug: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("legal_pages").delete().eq("slug", slug);
  if (error) throw error;
}
