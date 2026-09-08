import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const authError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

  // Read the "next" path from the cookie set by the login panel.
  const next = request.cookies.get("auth_next")?.value ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  // If Supabase redirected with an explicit error
  if (authError) {
    console.error("[auth/callback] Provider error:", authError);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(authError)}`, request.url),
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] code exchange error:", error.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
      );
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      console.error("[auth/callback] OTP verify error:", error.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
      );
    }
  }

  // Clear the auth_next cookie so it doesn't persist
  cookieStore.delete("auth_next");

  return NextResponse.redirect(new URL(safeNext, request.url));
}
