import "server-only";

import { createClient } from "./server";
import { getApiContextToken } from "./api-context";

export interface CurrentUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isDemo: boolean;
  birthDate: string | null;
  gender: string | null;
  interestedTags: string[];
}

/**
 * Bearer-token verification cache. Every /api/v1 route calls getCurrentUser(),
 * and each uncached call is a GoTrue roundtrip — Supabase rate-limits
 * /auth/user aggressively, so bursts of API calls produce flaky 401s.
 *
 * We cache the *verified* (signature-checked by GoTrue) user identity keyed by
 * the raw JWT, TTL-bounded by the token's own `exp`. The DB still re-verifies
 * the JWT on every query (PostgREST + RLS), so a forged token can never read or
 * write protected data — this cache only skips redundant identity roundtrips.
 */
interface CachedIdentity {
  id: string;
  email: string | null;
  metaName?: string;
  expiresAt: number; // epoch ms
}
const bearerIdentityCache = new Map<string, CachedIdentity>();
const MAX_CACHE_ENTRIES = 2000;

function readBearerCache(token: string): CachedIdentity | null {
  const hit = bearerIdentityCache.get(token);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    bearerIdentityCache.delete(token);
    return null;
  }
  return hit;
}

function writeBearerCache(token: string, identity: Omit<CachedIdentity, "expiresAt">) {
  // TTL = min(token exp, now + 120s) — decode exp just for the TTL (the
  // signature was already verified by GoTrue before we get here).
  let expiresAt = Date.now() + 60_000;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    if (typeof payload.exp === "number") {
      expiresAt = Math.min(payload.exp * 1000, Date.now() + 120_000);
    }
  } catch { /* malformed payload — keep short default */ }
  if (bearerIdentityCache.size >= MAX_CACHE_ENTRIES) bearerIdentityCache.clear();
  bearerIdentityCache.set(token, { ...identity, expiresAt });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const bearerToken = getApiContextToken();

  let userId: string | null = null;
  let emailFallback: string | null = null;
  let metaName: string | undefined;

  if (bearerToken) {
    const cached = readBearerCache(bearerToken);
    if (cached) {
      userId = cached.id;
      emailFallback = cached.email;
      metaName = cached.metaName;
    } else {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return null;
      userId = data.user.id;
      emailFallback = data.user.email ?? null;
      metaName = data.user.user_metadata?.full_name;
      writeBearerCache(bearerToken, { id: userId, email: emailFallback, metaName });
    }
  } else {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    userId = data.user.id;
    emailFallback = data.user.email ?? null;
    metaName = data.user.user_metadata?.full_name;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone, birth_date, gender, interested_tags")
    .eq("id", userId)
    .maybeSingle();

  return {
    id: userId,
    name: profile?.full_name ?? metaName ?? "Outsider",
    phone: profile?.phone ?? null,
    email: (profile as { email?: string | null })?.email ?? emailFallback,
    isDemo: false,
    birthDate: profile?.birth_date ?? null,
    gender: (profile as { gender?: string | null })?.gender ?? null,
    interestedTags: profile?.interested_tags ?? [],
  };
}
