import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/database.types";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/config";

/** Refreshes the Supabase auth cookie so Server Components see a live session. */
export async function updateSession(request: NextRequest) {
  // In development, the Devin browser preview proxy forwards requests from
  // 127.0.0.1:<port> to localhost:3001. Next.js Server Actions CSRF check
  // compares the `origin` header against `x-forwarded-host` — if they don't
  // match, it throws "Invalid Server Actions request." Fix: in dev only,
  // rewrite the x-forwarded-host to match the origin so the check passes.
  let requestHeaders = request.headers;
  if (process.env.NODE_ENV === "development") {
    const origin = request.headers.get("origin");
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (origin && forwardedHost) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== forwardedHost) {
          requestHeaders = new Headers(request.headers);
          requestHeaders.set("x-forwarded-host", originHost);
        }
      } catch {
        // ignore URL parse errors
      }
    }
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({
          request: { headers: requestHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}
