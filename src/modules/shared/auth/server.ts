import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "../db/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { getApiContextToken } from "./api-context";
import { createBearerClient } from "./bearer";

export async function createClient() {
  // Inside a /api/v1 route wrapped in withApiContext, prefer the bearer token
  // so mobile clients get the same auth.uid()/RLS behavior as cookie sessions.
  const bearerToken = getApiContextToken();
  if (bearerToken) return createBearerClient(bearerToken);

  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component: the middleware refreshes the session instead.
        }
      },
    },
  });
}
