import { describe, it, expect } from "vitest";
import {
  IDS,
  onlineOrder,
  boxOfficeOrder,
  validTicket,
  usedTicket,
  freeEvent,
  paidEvent,
  soldOutEvent,
  freeTier,
  paidGeneralTier,
  paidVipTier,
  soldOutTier,
  scannerPin,
  boxOfficePin,
  FINANCIAL_EXPECTATIONS,
  allEvents,
  allTiers,
  allOrders,
  allTickets,
  allUsers,
} from "./fixtures";
import { calculatePrice, DEFAULT_COMMISSION_BPS, DEFAULT_CONVENIENCE_FEE_BPS } from "@/lib/pricing";

/**
 * Integration tests using deterministic test fixtures.
 *
 * These tests verify the relationships between fixtures and the financial
 * calculations that the fixtures represent. They don't hit the database —
 * they use the in-memory fixtures from tests/fixtures.ts.
 *
 * For database-backed tests, run scripts/seed-test-data.mjs against a test
 * database and write tests that query via the Supabase client.
 */
describe("Test fixtures — data integrity", () => {
  it("all event IDs are unique", () => {
    const ids = allEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all tier IDs are unique", () => {
    const ids = allTiers.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all order IDs are unique", () => {
    const ids = allOrders.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all ticket IDs are unique", () => {
    const ids = allTickets.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all user IDs are unique", () => {
    const ids = allUsers.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every tier references a valid event", () => {
    const eventIds = new Set(allEvents.map((e) => e.id));
    for (const tier of allTiers) {
      expect(eventIds.has(tier.eventId)).toBe(true);
    }
  });

  it("every order references a valid event and tier", () => {
    const eventIds = new Set(allEvents.map((e) => e.id));
    const tierIds = new Set(allTiers.map((t) => t.id));
    for (const order of allOrders) {
      expect(eventIds.has(order.eventId)).toBe(true);
      expect(tierIds.has(order.tierId)).toBe(true);
    }
  });

  it("every ticket references a valid order and event", () => {
    const orderIds = new Set(allOrders.map((o) => o.id));
    const eventIds = new Set(allEvents.map((e) => e.id));
    for (const ticket of allTickets) {
      expect(orderIds.has(ticket.orderId)).toBe(true);
      expect(eventIds.has(ticket.eventId)).toBe(true);
    }
  });
});

describe("Test fixtures — financial accuracy", () => {
  it("online order matches financial expectations", () => {
    expect(onlineOrder.subtotalPaise).toBe(FINANCIAL_EXPECTATIONS.online.subtotal);
    expect(onlineOrder.commissionPaise).toBe(FINANCIAL_EXPECTATIONS.online.commission);
    expect(onlineOrder.convenienceFeePaise).toBe(FINANCIAL_EXPECTATIONS.online.convenienceFee);
    expect(onlineOrder.platformFeePaise).toBe(FINANCIAL_EXPECTATIONS.online.platformFee);
    expect(onlineOrder.organizerPayoutPaise).toBe(FINANCIAL_EXPECTATIONS.online.organizerPayout);
    expect(onlineOrder.totalPaise).toBe(FINANCIAL_EXPECTATIONS.online.buyerTotal);
  });

  it("box-office order has zero convenience fee", () => {
    expect(boxOfficeOrder.convenienceFeePaise).toBe(0);
    expect(boxOfficeOrder.totalPaise).toBe(boxOfficeOrder.subtotalPaise);
  });

  it("online order: buyer pays subtotal + convenience fee", () => {
    expect(onlineOrder.totalPaise).toBe(
      onlineOrder.subtotalPaise + onlineOrder.convenienceFeePaise,
    );
  });

  it("both orders: organizer receives subtotal - commission", () => {
    for (const order of allOrders) {
      expect(order.organizerPayoutPaise).toBe(
        order.subtotalPaise - order.commissionPaise,
      );
    }
  });

  it("both orders: platform fee = commission + convenience fee", () => {
    for (const order of allOrders) {
      expect(order.platformFeePaise).toBe(
        order.commissionPaise + order.convenienceFeePaise,
      );
    }
  });

  it("online order financials match calculatePrice()", () => {
    const feeConfig = {
      commissionBps: DEFAULT_COMMISSION_BPS,
      commissionEnabled: true,
      convenienceFeeBps: DEFAULT_CONVENIENCE_FEE_BPS,
      convenienceFeeEnabled: true,
    };
    const result = calculatePrice(50000, 1, "BUYER", undefined, feeConfig);
    expect(result.subtotalPaise).toBe(onlineOrder.subtotalPaise);
    expect(result.commissionPaise).toBe(onlineOrder.commissionPaise);
    expect(result.convenienceFeePaise).toBe(onlineOrder.convenienceFeePaise);
    expect(result.platformFeePaise).toBe(onlineOrder.platformFeePaise);
    expect(result.organizerPayoutPaise).toBe(onlineOrder.organizerPayoutPaise);
    expect(result.totalPaise).toBe(onlineOrder.totalPaise);
  });

  it("box-office order financials match calculatePrice() with no convenience fee", () => {
    const feeConfig = {
      commissionBps: DEFAULT_COMMISSION_BPS,
      commissionEnabled: true,
      convenienceFeeBps: DEFAULT_CONVENIENCE_FEE_BPS,
      convenienceFeeEnabled: false, // box office: no convenience fee
    };
    const result = calculatePrice(50000, 1, "BUYER", undefined, feeConfig);
    expect(result.subtotalPaise).toBe(boxOfficeOrder.subtotalPaise);
    expect(result.commissionPaise).toBe(boxOfficeOrder.commissionPaise);
    expect(result.convenienceFeePaise).toBe(0);
    expect(result.totalPaise).toBe(boxOfficeOrder.totalPaise);
    expect(result.organizerPayoutPaise).toBe(boxOfficeOrder.organizerPayoutPaise);
  });

  it("canonical 10×₹450 example matches fixture expectations", () => {
    const feeConfig = {
      commissionBps: DEFAULT_COMMISSION_BPS,
      commissionEnabled: true,
      convenienceFeeBps: DEFAULT_CONVENIENCE_FEE_BPS,
      convenienceFeeEnabled: true,
    };
    const c = FINANCIAL_EXPECTATIONS.canonical;
    const result = calculatePrice(c.unitPrice, c.quantity, "BUYER", undefined, feeConfig);
    expect(result.subtotalPaise).toBe(c.subtotal);
    expect(result.commissionPaise).toBe(c.commission);
    expect(result.convenienceFeePaise).toBe(c.convenienceFee);
    expect(result.platformFeePaise).toBe(c.platformFee);
    expect(result.organizerPayoutPaise).toBe(c.organizerPayout);
    expect(result.totalPaise).toBe(c.buyerTotal);
  });
});

describe("Test fixtures — inventory state", () => {
  it("free event has 100% availability", () => {
    expect(freeTier.quantitySold).toBe(0);
    expect(freeTier.quantity - freeTier.quantitySold).toBe(100);
  });

  it("paid event general tier has 2 sold, 48 available", () => {
    expect(paidGeneralTier.quantitySold).toBe(2);
    expect(paidGeneralTier.quantity - paidGeneralTier.quantitySold).toBe(48);
  });

  it("paid event VIP tier has 0 sold, 10 available", () => {
    expect(paidVipTier.quantitySold).toBe(0);
    expect(paidVipTier.quantity - paidVipTier.quantitySold).toBe(10);
  });

  it("sold-out event has 0 available", () => {
    expect(soldOutTier.quantitySold).toBe(soldOutTier.quantity);
    expect(soldOutTier.quantity - soldOutTier.quantitySold).toBe(0);
  });

  it("tickets sold in tracked tiers matches order quantities", () => {
    // Only check tiers that have orders in our fixture set (paid general tier).
    // The sold-out tier has pre-existing sales not tracked in our fixtures.
    const trackedTierIds = new Set(allOrders.map((o) => o.tierId));
    const totalSold = allTiers
      .filter((t) => trackedTierIds.has(t.id))
      .reduce((sum, t) => sum + t.quantitySold, 0);
    const totalOrdered = allOrders.reduce((sum, o) => sum + o.quantity, 0);
    expect(totalSold).toBe(totalOrdered);
  });
});

describe("Test fixtures — ticket state", () => {
  it("valid ticket is VALID and not checked in", () => {
    expect(validTicket.status).toBe("VALID");
    expect(validTicket.checkedInAt).toBeNull();
  });

  it("used ticket is USED and checked in", () => {
    expect(usedTicket.status).toBe("USED");
    expect(usedTicket.checkedInAt).not.toBeNull();
  });

  it("valid ticket belongs to online order", () => {
    expect(validTicket.orderId).toBe(onlineOrder.id);
  });

  it("used ticket belongs to box-office order", () => {
    expect(usedTicket.orderId).toBe(boxOfficeOrder.id);
  });

  it("both tickets are for the paid event", () => {
    expect(validTicket.eventId).toBe(IDS.PAID_EVENT_ID);
    expect(usedTicket.eventId).toBe(IDS.PAID_EVENT_ID);
  });

  it("ticket QR hashes are unique", () => {
    expect(validTicket.qrHash).not.toBe(usedTicket.qrHash);
  });
});

describe("Test fixtures — PIN state", () => {
  it("scanner PIN is active and for the paid event", () => {
    expect(scannerPin.eventId).toBe(IDS.PAID_EVENT_ID);
    expect(scannerPin.isActive).toBe(true);
    expect(scannerPin.pinCode).toBe("123456");
  });

  it("box-office PIN is active and for the paid event", () => {
    expect(boxOfficePin.eventId).toBe(IDS.PAID_EVENT_ID);
    expect(boxOfficePin.isActive).toBe(true);
    expect(boxOfficePin.pinCode).toBe("654321");
  });

  it("scanner and box-office PINs are different", () => {
    expect(scannerPin.pinCode).not.toBe(boxOfficePin.pinCode);
  });

  it("PINs are 6 digits", () => {
    expect(scannerPin.pinCode).toMatch(/^\d{6}$/);
    expect(boxOfficePin.pinCode).toMatch(/^\d{6}$/);
  });
});

describe("Test fixtures — event lifecycle", () => {
  it("all events are PUBLISHED", () => {
    for (const event of allEvents) {
      expect(event.status).toBe("PUBLISHED");
    }
  });

  it("free event has FREE pricing mode", () => {
    expect(freeEvent.pricingMode).toBe("FREE");
    expect(freeTier.pricePaise).toBe(0);
  });

  it("paid event has PAID pricing mode", () => {
    expect(paidEvent.pricingMode).toBe("PAID");
    expect(paidGeneralTier.pricePaise).toBeGreaterThan(0);
  });

  it("sold-out event is PUBLISHED (not CANCELLED)", () => {
    expect(soldOutEvent.status).toBe("PUBLISHED");
  });

  it("all events are in the future", () => {
    const now = new Date();
    for (const event of allEvents) {
      expect(new Date(event.startsAt).getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("paid event has door staff enabled", () => {
    expect(paidEvent.needsDoorStaff).toBe(true);
  });

  it("free event does not need door staff", () => {
    expect(freeEvent.needsDoorStaff).toBe(false);
  });
});
