import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Read the "next" path from the cookie set by the login panel.
  // We use a cookie instead of a query param because Supabase PKCE flow
  // requires the redirect URL to exactly match an entry in the allowed list.
  const next = request.cookies.get("auth_next")?.value ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  // Clear the auth_next cookie so it doesn't persist
  const response = NextResponse.redirect(`${origin}${next.startsWith("/") && !next.startsWith("//") ? next : "/"}`);
  response.cookies.delete("auth_next");
  return response;
}
