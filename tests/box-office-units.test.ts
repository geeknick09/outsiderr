import { describe, expect, it } from "vitest";

import { normalisePhone, validate, staffRegisterSchema, UUID_RE } from "@/modules/shared";
import { SCAN_MESSAGES, toScanResult } from "@/modules/scanner/lib/scan-result";

describe("door scan results", () => {
  const base = {
    event_title: "Night Cypher",
    tier_name: "General",
    holder_name: "Asha",
    checked_in_at: "2026-10-09T10:00:00Z",
  };

  it("maps each outcome to its door wording", () => {
    expect(toScanResult({ ...base, outcome: "VALID" }).message).toBe("Checked in.");
    expect(toScanResult({ ...base, outcome: "ALREADY_USED" }).message).toBe("This ticket has already been checked in.");
    expect(toScanResult({ ...base, outcome: "WRONG_EVENT" }).message).toBe("This ticket is for a different event.");
    expect(toScanResult({ ...base, outcome: "CANCELLED" }).message).toBe("This ticket was cancelled.");
    expect(toScanResult({ ...base, outcome: "DUPLICATE_CONFLICT" }).outcome).toBe("DUPLICATE_CONFLICT");
  });

  it("never sends buyer phone or email to the door", () => {
    const res = toScanResult({ ...base, outcome: "VALID" });
    expect(res.ticket?.holderEmail).toBeNull();
    expect(res.ticket?.holderPhone).toBeNull();
    expect(res.ticket?.holderName).toBe("Asha");
  });

  it("treats an unknown or missing row as INVALID", () => {
    expect(toScanResult(undefined)).toEqual({ outcome: "INVALID", message: SCAN_MESSAGES.INVALID });
    expect(toScanResult({ ...base, outcome: "SOMETHING_NEW" }).outcome).toBe("INVALID");
  });

  it("has wording for every outcome the door screens can show", () => {
    for (const msg of Object.values(SCAN_MESSAGES)) expect(msg.length).toBeGreaterThan(5);
  });
});

describe("phone normalisation", () => {
  it("keeps the last 10 digits", () => {
    expect(normalisePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalisePhone("98765 43210")).toBe("9876543210");
    expect(normalisePhone("(0) 9876543210")).toBe("9876543210");
  });

  it("returns short input unchanged so callers can reject it", () => {
    expect(normalisePhone("12345")).toBe("12345");
  });
});

describe("staff registration input", () => {
  it("accepts a name, a phone, and an empty email", () => {
    const v = validate(staffRegisterSchema, { name: "Asha Rao", email: "", phone: "9876543210" });
    expect(v.success).toBe(true);
  });

  it("rejects a one-character name", () => {
    const v = validate(staffRegisterSchema, { name: "A", email: "", phone: "9876543210" });
    expect(v.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const v = validate(staffRegisterSchema, { name: "Asha Rao", email: "not-an-email", phone: "9876543210" });
    expect(v.success).toBe(false);
  });
});

describe("ids", () => {
  it("UUID check accepts v4 ids and rejects text", () => {
    expect(UUID_RE.test("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(UUID_RE.test("3f2504e0-4f89-41d3-9a0c-0305e82c330")).toBe(false);
    expect(UUID_RE.test("'; drop table tickets;--")).toBe(false);
  });
});
