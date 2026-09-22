import "server-only";

import { NextResponse } from "next/server";

import { getCurrentUser, type CurrentUser } from "../auth/auth";
import { withApiContext } from "../auth/api-context";

/**
 * Response convention for /api/v1/* routes:
 *   success → { ok: true, data }
 *   failure → { ok: false, error }
 */
export function apiOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Wrap a /api/v1 route handler that requires an authenticated user.
 *
 * Reads `Authorization: Bearer <supabase-access-token>`, runs `handler` inside
 * an AsyncLocalStorage context so `createClient()`/`getCurrentUser()` resolve
 * the bearer user — identical behavior to a cookie-authenticated web request.
 *
 * `handler` receives the validated CurrentUser. Unauthenticated → 401.
 */
export function withApiUser(
  request: Request,
  handler: (user: CurrentUser) => Promise<NextResponse>,
): Promise<NextResponse> {
  return withApiContext(request, async () => {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);
    try {
      return await handler(user);
    } catch (error) {
      // Unhandled throw → 500 envelope instead of a bare crash.
      console.error("[api] unhandled error:", error);
      return apiError("Internal server error", 500);
    }
  });
}

/** Wrap a route handler that doesn't need a user (e.g. PIN-auth scanner routes). */
export function withApi(
  request: Request,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  return withApiContext(request, async () => {
    try {
      return await handler();
    } catch (error) {
      console.error("[api] unhandled error:", error);
      return apiError("Internal server error", 500);
    }
  });
}

/** Parse + validate a JSON body with a zod schema. Returns parsed data or a 400 response. */
export async function readJson<T>(
  request: Request,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
): Promise<{ data: T } | { response: NextResponse }> {
  let body: unknown;
  try {
    const text = await request.text();
    // Allow empty bodies on endpoints where every field is optional.
    body = text === "" ? {} : JSON.parse(text);
  } catch {
    return { response: apiError("Invalid JSON body", 400) };
  }
  if (body === null || body === undefined) body = {};
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return { response: apiError(msg, 400) };
  }
  return { data: parsed.data };
}
