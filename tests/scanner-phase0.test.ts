import { describe, expect, it } from "vitest";

import { UUID_RE, nextSaleAttempt } from "@/modules/shared";
import { decideLocalScan, toCachedRecord } from "@/modules/scanner/offline/cache-mapper";

describe("offline door cache decisions", () => {
  const EVENT = "11111111-1111-4111-8111-111111111111";
  const OTHER = "22222222-2222-4222-8222-222222222222";

  it("accepts a VALID cached ticket for this event", () => {
    expect(decideLocalScan({ event_id: EVENT, status: "VALID" }, EVENT)).toBe("VALID");
  });

  it("refuses a ticket already marked USED (second scan on the same device)", () => {
    expect(decideLocalScan({ event_id: EVENT, status: "USED" }, EVENT)).toBe("ALREADY_USED");
  });

  it("refuses a ticket that belongs to another event", () => {
    expect(decideLocalScan({ event_id: OTHER, status: "VALID" }, EVENT)).toBe("INVALID");
  });

  it("treats an unknown ticket as INVALID", () => {
    expect(decideLocalScan(null, EVENT)).toBe("INVALID");
  });
});

describe("offline cache record shape", () => {
  it("keeps only gate-relevant fields and never buyer phone or email", () => {
    const record = toCachedRecord(
      {
        qr_hash: "abc",
        event_id: "e1",
        status: "VALID",
        tier_name: "General",
        holder_name: "Asha",
        checked_in_at: null,
      },
      1234,
    );
    expect(Object.keys(record).sort()).toEqual(
      ["cached_at", "checked_in_at", "event_id", "holder_name", "qr_hash", "status", "tier_name"].sort(),
    );
    expect(record).not.toHaveProperty("buyer_phone");
    expect(record).not.toHaveProperty("buyer_email");
    expect(record.cached_at).toBe(1234);
  });
});

describe("counter sale idempotency key", () => {
  it("reuses the key when a retry has the same inputs", () => {
    let n = 0;
    const mk = () => `key-${++n}`;
    const first = nextSaleAttempt(null, "evt|tier|Asha|9999999999|mail|WALKIN_QR", mk);
    const retry = nextSaleAttempt(first, "evt|tier|Asha|9999999999|mail|WALKIN_QR", mk);
    expect(retry.key).toBe(first.key);
    expect(n).toBe(1);
  });

  it("starts a new sale when any input changes", () => {
    let n = 0;
    const mk = () => `key-${++n}`;
    const first = nextSaleAttempt(null, "evt|tierA|Asha|9999999999|mail|WALKIN_QR", mk);
    const changed = nextSaleAttempt(first, "evt|tierB|Asha|9999999999|mail|WALKIN_QR", mk);
    expect(changed.key).not.toBe(first.key);
  });

  it("generates UUIDs that pass the server-side check", () => {
    const attempt = nextSaleAttempt(null, "x");
    expect(UUID_RE.test(attempt.key)).toBe(true);
    expect(UUID_RE.test("not-a-uuid")).toBe(false);
    expect(UUID_RE.test("")).toBe(false);
  });
});
