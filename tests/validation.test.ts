import { describe, it, expect } from "vitest";
import {
  validate,
  pinSchema,
  staffNamesSchema,
  boxOfficeOrderSchema,
  verifyScannerPinSchema,
  verifyBoxOfficePinSchema,
  checkInWithPinSchema,
  revokePinSchema,
  generatePinsSchema,
  eventBasicSchema,
  ticketTierSchema,
  profileUpdateSchema,
} from "@/modules/shared";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("PIN validation", () => {
  it("accepts a valid 6-digit PIN", () => {
    expect(pinSchema.safeParse("123456").success).toBe(true);
  });

  it("rejects a 5-digit PIN", () => {
    expect(pinSchema.safeParse("12345").success).toBe(false);
  });

  it("rejects a 7-digit PIN", () => {
    expect(pinSchema.safeParse("1234567").success).toBe(false);
  });

  it("rejects non-numeric PIN", () => {
    expect(pinSchema.safeParse("abc123").success).toBe(false);
  });

  it("rejects empty PIN", () => {
    expect(pinSchema.safeParse("").success).toBe(false);
  });
});

describe("staffNamesSchema", () => {
  it("accepts a non-empty array of names", () => {
    expect(staffNamesSchema.safeParse(["Alice", "Bob"]).success).toBe(true);
  });

  it("rejects an empty array", () => {
    expect(staffNamesSchema.safeParse([]).success).toBe(false);
  });

  it("rejects names that are too long", () => {
    const longName = "a".repeat(101);
    expect(staffNamesSchema.safeParse([longName]).success).toBe(false);
  });

  it("rejects more than 50 names", () => {
    const names = Array(51).fill("Staff");
    expect(staffNamesSchema.safeParse(names).success).toBe(false);
  });
});

describe("boxOfficeOrderSchema", () => {
  const validInput = {
    eventId: VALID_UUID,
    pin: "123456",
    tierId: null,
    buyerName: "John Doe",
    buyerPhone: "9876543210",
    buyerEmail: null,
    amountPaise: 45000,
    mode: "WALKIN_PREEVENT" as const,
  };

  it("accepts valid input", () => {
    expect(boxOfficeOrderSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepts valid email", () => {
    expect(
      boxOfficeOrderSchema.safeParse({ ...validInput, buyerEmail: "john@example.com" }).success,
    ).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(
      boxOfficeOrderSchema.safeParse({ ...validInput, buyerEmail: "not-an-email" }).success,
    ).toBe(false);
  });

  it("rejects invalid eventId", () => {
    expect(
      boxOfficeOrderSchema.safeParse({ ...validInput, eventId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects invalid mode", () => {
    expect(
      boxOfficeOrderSchema.safeParse({ ...validInput, mode: "INVALID_MODE" }).success,
    ).toBe(false);
  });

  it("rejects negative amount", () => {
    expect(
      boxOfficeOrderSchema.safeParse({ ...validInput, amountPaise: -100 }).success,
    ).toBe(false);
  });

  it("rejects short phone", () => {
    expect(
      boxOfficeOrderSchema.safeParse({ ...validInput, buyerPhone: "123" }).success,
    ).toBe(false);
  });

  it("rejects empty buyerName", () => {
    expect(
      boxOfficeOrderSchema.safeParse({ ...validInput, buyerName: "" }).success,
    ).toBe(false);
  });
});

describe("verifyScannerPinSchema", () => {
  it("accepts valid input", () => {
    expect(
      verifyScannerPinSchema.safeParse({ eventId: VALID_UUID, pin: "123456" }).success,
    ).toBe(true);
  });

  it("rejects invalid eventId", () => {
    expect(
      verifyScannerPinSchema.safeParse({ eventId: "bad", pin: "123456" }).success,
    ).toBe(false);
  });
});

describe("verifyBoxOfficePinSchema", () => {
  it("accepts valid input", () => {
    expect(
      verifyBoxOfficePinSchema.safeParse({ eventId: VALID_UUID, pin: "123456" }).success,
    ).toBe(true);
  });
});

describe("checkInWithPinSchema", () => {
  it("accepts valid input", () => {
    expect(
      checkInWithPinSchema.safeParse({
        qrHash: "a".repeat(32),
        eventId: VALID_UUID,
        pin: "123456",
      }).success,
    ).toBe(true);
  });

  it("rejects short qrHash", () => {
    expect(
      checkInWithPinSchema.safeParse({
        qrHash: "short",
        eventId: VALID_UUID,
        pin: "123456",
      }).success,
    ).toBe(false);
  });
});

describe("revokePinSchema", () => {
  it("accepts valid UUIDs", () => {
    expect(
      revokePinSchema.safeParse({ pinId: VALID_UUID, eventId: VALID_UUID }).success,
    ).toBe(true);
  });
});

describe("generatePinsSchema", () => {
  it("accepts valid input with default role", () => {
    const result = generatePinsSchema.safeParse({
      eventId: VALID_UUID,
      staffNames: ["Alice"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("ORGANIZER");
    }
  });

  it("accepts ADMIN role", () => {
    expect(
      generatePinsSchema.safeParse({
        eventId: VALID_UUID,
        staffNames: ["Alice"],
        role: "ADMIN",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid role", () => {
    expect(
      generatePinsSchema.safeParse({
        eventId: VALID_UUID,
        staffNames: ["Alice"],
        role: "SUPERADMIN",
      }).success,
    ).toBe(false);
  });
});

describe("eventBasicSchema", () => {
  it("accepts valid event", () => {
    expect(
      eventBasicSchema.safeParse({
        title: "Hip Hop Night",
        city: "Mumbai",
        category: "MUSIC",
        startsAt: "2026-12-01T19:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects short title", () => {
    expect(
      eventBasicSchema.safeParse({
        title: "A",
        city: "Mumbai",
        category: "MUSIC",
        startsAt: "2026-12-01T19:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("ticketTierSchema", () => {
  it("accepts valid tier", () => {
    expect(
      ticketTierSchema.safeParse({ name: "General", pricePaise: 45000, quantity: 100 }).success,
    ).toBe(true);
  });

  it("rejects zero quantity", () => {
    expect(
      ticketTierSchema.safeParse({ name: "General", pricePaise: 45000, quantity: 0 }).success,
    ).toBe(false);
  });

  it("rejects negative price", () => {
    expect(
      ticketTierSchema.safeParse({ name: "General", pricePaise: -100, quantity: 10 }).success,
    ).toBe(false);
  });
});

describe("profileUpdateSchema", () => {
  it("accepts valid profile", () => {
    expect(
      profileUpdateSchema.safeParse({
        fullName: "John Doe",
        phone: "9876543210",
      }).success,
    ).toBe(true);
  });

  it("rejects empty name", () => {
    expect(
      profileUpdateSchema.safeParse({ fullName: "" }).success,
    ).toBe(false);
  });
});

describe("validate helper", () => {
  it("returns success with data on valid input", () => {
    const result = validate(pinSchema, "123456");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("123456");
    }
  });

  it("returns error on invalid input", () => {
    const result = validate(pinSchema, "bad");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });
});
