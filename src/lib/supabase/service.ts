import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Supabase client using the service role key — bypasses RLS.
 *
 * ONLY use this in contexts with NO user auth:
 *  - Razorpay webhook handler
 *  - Cron job handlers
 *  - Internal admin batch operations
 *
 * NEVER expose the service role key to the browser.
 * NEVER use this for user-facing requests.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. This is required for webhook handlers and cron jobs.",
    );
  }
  return createSupabaseClient<Database>(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Whether the service role key is configured.
 */
export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
