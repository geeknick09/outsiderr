import { describe, it, expect } from "vitest";
import {
  calculatePrice,
  getFeeBpsForPrice,
  platformFee,
  gatewayFeePaise,
  buyerFeePaise,
  refundableAmountPaise,
  DEFAULT_FEE_TIERS,
  DEFAULT_COMMISSION_BPS,
  DEFAULT_CONVENIENCE_FEE_BPS,
  DEFAULT_GATEWAY_FEE_BPS,
} from "@/modules/shared";

describe("Financial calculations — dual-fee model", () => {
  // The canonical example from the product spec:
  // 10 tickets at ₹450 each
  //   subtotal:     ₹4,500 (450,000 paise)
  //   commission:   ₹450  (45,000 paise)  — 10% of subtotal
  //   convenience:  ₹90   (9,000 paise)   — 2% of subtotal
  //   platform rev: ₹540  (54,000 paise)
  //   organizer:    ₹4,050 (405,000 paise)
  //   gateway:      ₹110.94 (11,094 paise) — 2.36% gross-up
  //   buyer total:  ₹4,700.94 (470,094 paise)

  const feeConfig = {
    commissionBps: DEFAULT_COMMISSION_BPS,       // 10%
    commissionEnabled: true,
    convenienceFeeBps: DEFAULT_CONVENIENCE_FEE_BPS, // 2%
    convenienceFeeEnabled: true,
  };

  it("matches the canonical 10 × ₹450 example exactly", () => {
    const result = calculatePrice(45000, 10, "BUYER", undefined, feeConfig);

    expect(result.subtotalPaise).toBe(450000);
    expect(result.commissionPaise).toBe(45000);
    expect(result.convenienceFeePaise).toBe(9000);
    expect(result.platformFeePaise).toBe(54000); // commission + convenience
    expect(result.gatewayFeePaise).toBe(11094);  // round(459000 * 236 / 9764)
    expect(result.organizerPayoutPaise).toBe(405000);
    expect(result.totalPaise).toBe(470094);      // sub + conv + gateway
    expect(result.grossRevenuePaise).toBe(450000);
  });

  it("buyer pays subtotal + convenience fee + gateway fee", () => {
    const result = calculatePrice(100000, 1, "BUYER", undefined, feeConfig);
    expect(result.totalPaise).toBe(
      result.subtotalPaise + result.convenienceFeePaise + result.gatewayFeePaise,
    );
  });

  it("organizer receives subtotal - commission", () => {
    const result = calculatePrice(100000, 1, "BUYER", undefined, feeConfig);
    expect(result.organizerPayoutPaise).toBe(result.subtotalPaise - result.commissionPaise);
  });

  it("platform revenue = commission + convenience fee", () => {
    const result = calculatePrice(100000, 1, "BUYER", undefined, feeConfig);
    expect(result.platformFeePaise).toBe(result.commissionPaise + result.convenienceFeePaise);
  });

  it("handles single ticket correctly", () => {
    const result = calculatePrice(50000, 1, "BUYER", undefined, feeConfig);
    expect(result.subtotalPaise).toBe(50000);
    expect(result.commissionPaise).toBe(5000);   // 10% of 50000
    expect(result.convenienceFeePaise).toBe(1000); // 2% of 50000
    expect(result.gatewayFeePaise).toBe(1233);   // round(51000 * 236 / 9764)
    expect(result.totalPaise).toBe(52233);
    expect(result.organizerPayoutPaise).toBe(45000);
  });

  it("handles free events (zero fees)", () => {
    const result = calculatePrice(0, 5, "BUYER", undefined, feeConfig);
    expect(result.subtotalPaise).toBe(0);
    expect(result.commissionPaise).toBe(0);
    expect(result.convenienceFeePaise).toBe(0);
    expect(result.totalPaise).toBe(0);
    expect(result.organizerPayoutPaise).toBe(0);
  });

  it("handles disabled commission", () => {
    const result = calculatePrice(50000, 1, "BUYER", undefined, {
      ...feeConfig,
      commissionEnabled: false,
    });
    expect(result.commissionPaise).toBe(0);
    expect(result.organizerPayoutPaise).toBe(50000); // full subtotal
  });

  it("handles disabled convenience fee", () => {
    const result = calculatePrice(50000, 1, "BUYER", undefined, {
      ...feeConfig,
      convenienceFeeEnabled: false,
    });
    expect(result.convenienceFeePaise).toBe(0);
    expect(result.gatewayFeePaise).toBe(0);    // gateway fee bundled into convenience — disabled together
    expect(result.totalPaise).toBe(50000); // no convenience fee added
  });

  it("handles large quantities without overflow", () => {
    const result = calculatePrice(45000, 1000, "BUYER", undefined, feeConfig);
    expect(result.subtotalPaise).toBe(45000000);
    expect(result.commissionPaise).toBe(4500000);
    expect(result.convenienceFeePaise).toBe(900000);
    expect(result.gatewayFeePaise).toBe(1109422); // round(45900000 * 236 / 9764)
    expect(result.totalPaise).toBe(47009422);
    expect(result.organizerPayoutPaise).toBe(40500000);
  });
});

describe("Box office / walk-in orders (no convenience fee)", () => {
  // Box office orders do NOT charge a convenience fee.
  // The RPC create_walkin_order sets convenience_fee_paise = 0.
  // This test verifies the financial model for manual sales.

  const feeConfig = {
    commissionBps: DEFAULT_COMMISSION_BPS,
    commissionEnabled: true,
    convenienceFeeBps: DEFAULT_CONVENIENCE_FEE_BPS,
    convenienceFeeEnabled: false, // box office: no convenience fee
  };

  it("10 × ₹450 box office: buyer pays subtotal, no convenience fee", () => {
    const result = calculatePrice(45000, 10, "BUYER", undefined, feeConfig);
    expect(result.subtotalPaise).toBe(450000);
    expect(result.commissionPaise).toBe(45000);
    expect(result.convenienceFeePaise).toBe(0);
    expect(result.totalPaise).toBe(450000); // buyer pays exactly subtotal
    expect(result.organizerPayoutPaise).toBe(405000);
  });
});

describe("Tiered fee (legacy model)", () => {
  it("applies 10% for tickets under ₹500", () => {
    expect(getFeeBpsForPrice(49999)).toBe(DEFAULT_FEE_TIERS.tier1Bps);
  });

  it("applies 7% for ₹500–₹3000", () => {
    expect(getFeeBpsForPrice(50000)).toBe(DEFAULT_FEE_TIERS.tier2Bps);
    expect(getFeeBpsForPrice(300000)).toBe(DEFAULT_FEE_TIERS.tier2Bps);
  });

  it("applies 5% for tickets above ₹3000", () => {
    expect(getFeeBpsForPrice(300001)).toBe(DEFAULT_FEE_TIERS.tier3Bps);
  });

  it("platformFee rounds correctly", () => {
    expect(platformFee(45000, 1000)).toBe(4500);
    expect(platformFee(100, 1000)).toBe(10);
    expect(platformFee(1, 1000)).toBe(0); // rounds to 0
  });
});

describe("Financial invariants", () => {
  const feeConfig = {
    commissionBps: DEFAULT_COMMISSION_BPS,
    commissionEnabled: true,
    convenienceFeeBps: DEFAULT_CONVENIENCE_FEE_BPS,
    convenienceFeeEnabled: true,
  };

  it("subtotal = unit price × quantity", () => {
    for (const [price, qty] of [[45000, 1], [45000, 10], [100, 100], [50000, 5]]) {
      const result = calculatePrice(price, qty, "BUYER", undefined, feeConfig);
      expect(result.subtotalPaise).toBe(price * qty);
    }
  });

  it("commission = round(subtotal × commissionBps / 10000)", () => {
    for (const [price, qty] of [[45000, 1], [45000, 10], [33333, 3]]) {
      const result = calculatePrice(price, qty, "BUYER", undefined, feeConfig);
      const expected = Math.round((price * qty * feeConfig.commissionBps) / 10000);
      expect(result.commissionPaise).toBe(expected);
    }
  });

  it("convenience fee = round(subtotal × convenienceFeeBps / 10000)", () => {
    for (const [price, qty] of [[45000, 1], [45000, 10], [33333, 3]]) {
      const result = calculatePrice(price, qty, "BUYER", undefined, feeConfig);
      const expected = Math.round((price * qty * feeConfig.convenienceFeeBps) / 10000);
      expect(result.convenienceFeePaise).toBe(expected);
    }
  });

  it("organizer payout + commission = subtotal (no money lost)", () => {
    for (const [price, qty] of [[45000, 1], [45000, 10], [33333, 3], [100, 7]]) {
      const result = calculatePrice(price, qty, "BUYER", undefined, feeConfig);
      expect(result.organizerPayoutPaise + result.commissionPaise).toBe(result.subtotalPaise);
    }
  });

  it("buyer total = subtotal + convenience + gateway (no hidden charges)", () => {
    for (const [price, qty] of [[45000, 1], [45000, 10], [33333, 3], [100, 7]]) {
      const result = calculatePrice(price, qty, "BUYER", undefined, feeConfig);
      expect(result.totalPaise).toBe(
        result.subtotalPaise + result.convenienceFeePaise + result.gatewayFeePaise,
      );
    }
  });
});

describe("Gateway fee gross-up", () => {
  it("matches the create_reserved_order SQL formula", () => {
    // SQL: round((subtotal + convenience) * bps / (10000 - bps))
    for (const [sub, conv] of [[450000, 9000], [50000, 1000], [333330, 6667], [100, 2]]) {
      const expected = Math.round(((sub + conv) * DEFAULT_GATEWAY_FEE_BPS) / (10000 - DEFAULT_GATEWAY_FEE_BPS));
      expect(gatewayFeePaise(sub, conv)).toBe(expected);
    }
  });

  it("covers Razorpay's cut within 1 paisa", () => {
    // Razorpay charges bps on the TOTAL collected — the grossed-up fee must
    // be within 1 paise of what they'd take.
    for (const [sub, conv] of [[450000, 9000], [50000, 1000], [123456, 2469], [99999, 2000]]) {
      const gw = gatewayFeePaise(sub, conv);
      const total = sub + conv + gw;
      const rzpCut = Math.round((total * DEFAULT_GATEWAY_FEE_BPS) / 10000);
      expect(Math.abs(gw - rzpCut)).toBeLessThanOrEqual(1);
    }
  });

  it("gateway fee is 0 when convenience fees are disabled (box office)", () => {
    const result = calculatePrice(45000, 2, "BUYER", undefined, {
      commissionBps: 1000,
      commissionEnabled: true,
      convenienceFeeBps: 0,
      convenienceFeeEnabled: false,
    });
    expect(result.gatewayFeePaise).toBe(0);
    expect(result.totalPaise).toBe(result.subtotalPaise);
  });

  it("buyerFeePaise = convenience + gateway", () => {
    const result = calculatePrice(45000, 10, "BUYER", undefined, {
      commissionBps: 1000,
      commissionEnabled: true,
      convenienceFeeBps: 200,
      convenienceFeeEnabled: true,
    });
    expect(buyerFeePaise(result)).toBe(result.convenienceFeePaise + result.gatewayFeePaise);
  });
});

describe("Refundable amounts (BMS model)", () => {
  const cfg = {
    commissionBps: 1000,
    commissionEnabled: true,
    convenienceFeeBps: 200,
    convenienceFeeEnabled: true,
  };

  it("TICKET_PRICE scope refunds the subtotal only", () => {
    const price = calculatePrice(45000, 10, "BUYER", undefined, cfg);
    expect(refundableAmountPaise(price, "TICKET_PRICE")).toBe(450000);
  });

  it("FULL scope refunds everything (platform-fault override)", () => {
    const price = calculatePrice(45000, 10, "BUYER", undefined, cfg);
    expect(refundableAmountPaise(price, "FULL")).toBe(price.totalPaise);
  });
});
