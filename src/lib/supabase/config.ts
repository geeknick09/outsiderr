export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * The app is now Supabase-only. This function always returns true and is kept
 * only for backward compatibility while other files remove their imports.
 */
export function isSupabaseConfigured(): boolean {
  return true;
}

export const STORAGE_BUCKET = "event-media";
