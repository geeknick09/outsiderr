export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Canonical app URL used for auth redirects (Supabase callback, OAuth, magic links).
 * Must be set per environment so Supabase can validate the redirect URL.
 *
 * - Local dev: NEXT_PUBLIC_APP_URL=http://localhost:3000
 * - Production: NEXT_PUBLIC_APP_URL=https://outsiderr.in
 */
const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
export const APP_URL = rawAppUrl;

/**
 * Returns the base URL to use for auth redirects.
 * Prefers NEXT_PUBLIC_APP_URL (stable, env-driven). Falls back to the current
 * browser origin on the client so redirects always go to the current domain.
 */
export function getAuthRedirectBase(): string {
  if (APP_URL) return APP_URL.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/**
 * The app is now Supabase-only. This function always returns true and is kept
 * only for backward compatibility while other files remove their imports.
 */
export function isSupabaseConfigured(): boolean {
  return true;
}

export const STORAGE_BUCKET = "event-media";
