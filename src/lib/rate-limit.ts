/**
 * Simple in-memory rate limiter for server actions and API routes.
 *
 * - Per-IP, per-action sliding window.
 * - Works in serverless (per-instance) — for production-grade rate limiting
 *   consider Upstash Redis or Vercel KV. This is a baseline defense against
 *   brute-force PIN guessing and abuse.
 *
 * Limits are intentionally generous for legitimate users but block
 * rapid-fire abuse (e.g. 100 PIN guesses in 10 seconds).
 */

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

// Periodically clean up expired buckets to avoid memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

// Preset limits for common actions
export const RATE_LIMITS = {
  // PIN verification: 20 attempts per minute per IP (brute-force defense)
  PIN_VERIFY: { maxRequests: 20, windowMs: 60 * 1000 },
  // Box office order creation: 10 per minute per IP (prevent duplicate spam)
  BOX_OFFICE_ORDER: { maxRequests: 10, windowMs: 60 * 1000 },
  // Check-in: 60 per minute per IP (legitimate high-volume scanning)
  CHECK_IN: { maxRequests: 60, windowMs: 60 * 1000 },
  // Checkout: 10 per minute per IP (prevent reservation spam)
  CHECKOUT: { maxRequests: 10, windowMs: 60 * 1000 },
  // Login: 10 per minute per IP (brute-force defense)
  LOGIN: { maxRequests: 10, windowMs: 60 * 1000 },
  // Generic API: 100 per minute per IP
  API: { maxRequests: 100, windowMs: 60 * 1000 },
} as const;

/**
 * Check if a request should be rate-limited.
 * Returns { limited: true, retryAfterMs } if rate-limited,
 * or { limited: false } if allowed.
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig,
): { limited: boolean; retryAfterMs?: number; remaining: number } {
  cleanup();

  const now = Date.now();
  const key = `${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    // Create new bucket
    buckets.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return { limited: false, remaining: config.maxRequests - 1 };
  }

  if (bucket.count >= config.maxRequests) {
    return {
      limited: true,
      retryAfterMs: bucket.resetAt - now,
      remaining: 0,
    };
  }

  bucket.count++;
  return {
    limited: false,
    remaining: config.maxRequests - bucket.count,
  };
}

/**
 * Get a rate-limit identifier from request headers.
 * Uses x-forwarded-for (Vercel/proxy) or falls back to a generic identifier.
 */
export function getRateLimitIdentifier(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP (client IP)
    return forwarded.split(",")[0].trim();
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  // Fallback: use user-agent as a weak identifier
  return `unknown:${headers.get("user-agent") ?? "no-ua"}`;
}
