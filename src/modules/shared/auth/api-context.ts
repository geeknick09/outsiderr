import { AsyncLocalStorage } from "async_hooks";

/**
 * Request-scoped auth context for /api/v1/* route handlers.
 *
 * Mobile clients send `Authorization: Bearer <supabase-access-token>` instead of
 * cookies. `withApiAuth` stores the token in AsyncLocalStorage for the duration
 * of the handler — `createClient()` then builds a bearer-scoped client so every
 * downstream data fn, RPC (auth.uid()), and RLS policy resolves the same user
 * as the web's cookie-based session.
 */
interface ApiContext {
  token: string;
}

const store = new AsyncLocalStorage<ApiContext>();

export function getApiContextToken(): string | null {
  return store.getStore()?.token ?? null;
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Run `handler` with the request's bearer token in context (or none). */
export function withApiContext<T>(request: Request, handler: () => Promise<T>): Promise<T> {
  const token = extractBearerToken(request);
  return store.run({ token: token ?? "" }, handler);
}
