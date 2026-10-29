"use client";

import { createClient } from "../auth/client";
import { STORAGE_BUCKET } from "../auth/config";

/**
 * Uploads to Supabase Storage and returns a public URL.
 * On error, throws with a helpful message.
 */
export async function uploadPublicFile(
  file: File,
  folder: string,
): Promise<string | null> {
  const supabase = createClient();
  // Every upload lives under the owner's user dir: users/{uid}/{scope}/...
  // getSession() reads the cached local session - getUser() is a network call
  // that can return null on a live session and produced "anonymous" folders.
  const { data: { session } } = await supabase.auth.getSession();
  const owner = session?.user?.id;
  if (!owner) throw new Error("Sign in to upload files.");
  const extension = file.name.split(".").pop() ?? "bin";
  const path = `users/${owner}/${folder}/${crypto.randomUUID()}.${extension}`;

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
