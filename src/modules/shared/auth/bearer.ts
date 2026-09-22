import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Supabase client scoped to a bearer access token (mobile/API clients).
 *
 * The JWT travels in the `Authorization` header on every request — PostgREST
 * resolves `auth.uid()` from it, so RLS and security-definer RPCs behave exactly
 * as they do for a cookie-authenticated web user.
 */
export function createBearerClient(token: string) {
  return createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
