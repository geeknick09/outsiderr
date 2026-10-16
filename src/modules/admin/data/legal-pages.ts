import "server-only";

import { createClient } from "@/modules/shared/server";

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

const VERSIONS_KEPT = 10;

export async function upsertLegalPage(
  userId: string,
  slug: string,
  title: string,
  content: string,
  isPublished: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("legal_pages")
    .select("version, title, content, is_published, updated_by")
    .eq("slug", slug)
    .maybeSingle();
  const nextVersion = (current?.version ?? 0) + 1;
  // Backfill: snapshot the outgoing row if its version has no history entry,
  // so a missed/failed snapshot never leaves a hole in the chain.
  if (current) {
    await supabase.from("legal_page_versions").upsert(
      {
        slug,
        version: current.version,
        title: current.title,
        content: current.content,
        is_published: current.is_published,
        saved_by: current.updated_by,
      },
      { onConflict: "slug,version", ignoreDuplicates: true },
    );
  }
  const { error } = await supabase
    .from("legal_pages")
    .upsert({
      slug,
      title,
      content,
      version: nextVersion,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });
  if (error) throw error;
  // Snapshot for the version history (fire-and-forget safe: ignore dup-version conflicts).
  await supabase.from("legal_page_versions").upsert(
    { slug, version: nextVersion, title, content, is_published: isPublished, saved_by: userId },
    { onConflict: "slug,version", ignoreDuplicates: true },
  );
  // Prune history beyond the last N versions per slug.
  const { data: old } = await supabase
    .from("legal_page_versions")
    .select("id")
    .eq("slug", slug)
    .order("version", { ascending: false })
    .range(VERSIONS_KEPT, 100);
  const ids = (old ?? []).map((r) => r.id);
  if (ids.length) await supabase.from("legal_page_versions").delete().in("id", ids);
}

export interface LegalPageVersion {
  id: string;
  version: number;
  title: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  savedByEmail: string | null;
}

export async function listLegalPageVersions(slug: string): Promise<LegalPageVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("legal_page_versions")
    .select("id, version, title, content, is_published, created_at, saved_by")
    .eq("slug", slug)
    .order("version", { ascending: false })
    .limit(10);
  const saverIds = [...new Set((data ?? []).map((r) => r.saved_by).filter(Boolean))] as string[];
  const { data: savers } = saverIds.length
    ? await supabase.from("profiles").select("id, email").in("id", saverIds)
    : { data: [] };
  const emailMap = new Map((savers ?? []).map((p) => [p.id, p.email]));
  return (data ?? []).map((r) => ({
    id: r.id,
    version: r.version,
    title: r.title,
    content: r.content,
    isPublished: r.is_published,
    createdAt: r.created_at,
    savedByEmail: emailMap.get(r.saved_by ?? "") ?? null,
  }));
}

/** Restore a past version - saves it as a NEW current version (history stays intact). */
export async function restoreLegalPageVersion(
  userId: string,
  slug: string,
  version: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: v } = await supabase
    .from("legal_page_versions")
    .select("title, content, is_published")
    .eq("slug", slug)
    .eq("version", version)
    .maybeSingle();
  if (!v) return { error: "Version not found." };
  await upsertLegalPage(userId, slug, v.title, v.content, v.is_published);
  return {};
}

export async function deleteLegalPage(slug: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("legal_pages").delete().eq("slug", slug);
  if (error) throw error;
}
