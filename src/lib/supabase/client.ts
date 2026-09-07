import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Singleton: one browser client for the entire session.
// Prevents multiple WebSocket connections when components each call createClient().
let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!_client) {
    _client = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}
