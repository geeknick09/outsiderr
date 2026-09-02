"use client";

import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Uploads to Supabase Storage and returns a public URL.
 * Returns null in demo mode, where no storage bucket exists.
 * On error, throws with a helpful message.
 */
export async function uploadPublicFile(
  file: File,
  folder: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "bin";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) {
    console.error("[upload] Supabase storage error:", {
      message: error.message,
      name: error.name,
      path,
      bucket: STORAGE_BUCKET,
    });

    if (error.message.includes("not found") || error.message.includes("Bucket not found")) {
      throw new Error(
        `Storage bucket "${STORAGE_BUCKET}" not found. Create it in Supabase Dashboard → Storage.`,
      );
    }
    if (error.message.includes("policy") || error.message.includes("permission") || error.message.includes("RLS")) {
      throw new Error(
        `Upload denied by Storage RLS. Run the latest schema.sql in Supabase SQL Editor to add storage policies.`,
      );
    }
    throw new Error(`Upload failed: ${error.message}`);
  }

  const publicUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  console.info("[upload] Success:", { path, publicUrl, data });
  return publicUrl;
}
