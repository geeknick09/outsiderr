import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, RATE_LIMITS, type RateLimitConfig } from "@/lib/rate-limit";

// Use a unique identifier per test to avoid cross-test interference
let counter = 0;
function uniqueId() {
  counter++;
  return `test-${counter}`;
}

describe("rateLimit", () => {
  it("allows first request", () => {
    const id = uniqueId();
    const config: RateLimitConfig = { maxRequests: 5, windowMs: 1000 };
    const result = rateLimit(id, config);
    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(4);
  });

  it("allows up to maxRequests", () => {
    const id = uniqueId();
    const config: RateLimitConfig = { maxRequests: 3, windowMs: 1000 };
    expect(rateLimit(id, config).limited).toBe(false);
    expect(rateLimit(id, config).limited).toBe(false);
    expect(rateLimit(id, config).limited).toBe(false);
  });

  it("blocks after maxRequests exceeded", () => {
    const id = uniqueId();
    const config: RateLimitConfig = { maxRequests: 2, windowMs: 1000 };
    rateLimit(id, config);
    rateLimit(id, config);
    const result = rateLimit(id, config);
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("provides retryAfterMs when limited", () => {
    const id = uniqueId();
    const config: RateLimitConfig = { maxRequests: 1, windowMs: 1000 };
    rateLimit(id, config);
    const result = rateLimit(id, config);
    expect(result.limited).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  it("tracks remaining correctly", () => {
    const id = uniqueId();
    const config: RateLimitConfig = { maxRequests: 5, windowMs: 1000 };
    expect(rateLimit(id, config).remaining).toBe(4);
    expect(rateLimit(id, config).remaining).toBe(3);
    expect(rateLimit(id, config).remaining).toBe(2);
    expect(rateLimit(id, config).remaining).toBe(1);
    expect(rateLimit(id, config).remaining).toBe(0);
  });

  it("uses separate buckets for different identifiers", () => {
    const id1 = uniqueId();
    const id2 = uniqueId();
    const config: RateLimitConfig = { maxRequests: 1, windowMs: 1000 };
    expect(rateLimit(id1, config).limited).toBe(false);
    expect(rateLimit(id2, config).limited).toBe(false);
    // Both should now be at their limit
    expect(rateLimit(id1, config).limited).toBe(true);
    expect(rateLimit(id2, config).limited).toBe(true);
  });
});

describe("RATE_LIMITS presets", () => {
  it("PIN_VERIFY allows 20 per minute", () => {
    expect(RATE_LIMITS.PIN_VERIFY.maxRequests).toBe(20);
    expect(RATE_LIMITS.PIN_VERIFY.windowMs).toBe(60 * 1000);
  });

  it("BOX_OFFICE_ORDER allows 10 per minute", () => {
    expect(RATE_LIMITS.BOX_OFFICE_ORDER.maxRequests).toBe(10);
  });

  it("CHECK_IN allows 60 per minute", () => {
    expect(RATE_LIMITS.CHECK_IN.maxRequests).toBe(60);
  });

  it("LOGIN allows 10 per minute", () => {
    expect(RATE_LIMITS.LOGIN.maxRequests).toBe(10);
  });
});
