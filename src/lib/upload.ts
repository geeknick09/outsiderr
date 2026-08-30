"use client";

import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Uploads to Supabase Storage and returns a public URL.
 * Returns null in demo mode, where no storage bucket exists.
 */
export async function uploadPublicFile(
  file: File,
  folder: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "bin";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
