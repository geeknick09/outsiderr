import type { FeePayer } from "./types";

export interface PriceBreakdown {
  /** Face value of the tickets: unit price x quantity. */
  subtotalPaise: number;
  /** Platform commission + convenience fee combined. */
  platformFeePaise: number;
  /** Organizer commission deducted from payout. */
  commissionPaise: number;
  /** Buyer convenience fee added on top. */
  convenienceFeePaise: number;
  /** Gateway fee (Razorpay ~2.36% gross-up) bundled in the buyer total. */
  gatewayFeePaise: number;
  /** What the buyer actually pays via Razorpay. */
  totalPaise: number;
  /** What the organizer receives once the order is confirmed. */
  organizerPayoutPaise: number;
  /** Gross revenue (subtotal, before fees). */
  grossRevenuePaise: number;
  feePayer: FeePayer;
  /** Effective fee rate in basis points (for display). */
  feeBps: number;
}

/**
 * Tiered platform fee based on ticket price (per ticket, in paise):
 *   < ₹500  (50000 paise)   → 10% (1000 bps)
 *   ≥ ₹500 and ≤ ₹3000      → 7%  (700 bps)
 *   > ₹3000 (300000 paise)  → 5%  (500 bps)
 *
 * Admin can override these thresholds via platform settings.
 */
export const DEFAULT_FEE_TIERS = {
  tier1MaxPaise: 50000,    // ₹500
  tier2MaxPaise: 300000,   // ₹3000
  tier1Bps: 1000,          // 10%
  tier2Bps: 700,           // 7%
  tier3Bps: 500,           // 5%
};

export type FeeTiers = typeof DEFAULT_FEE_TIERS;

/**
 * Get the fee rate (in basis points) for a given ticket price.
 * Uses tiered pricing: <₹500=10%, ≥₹500 & ≤₹3000=7%, >₹3000=5%.
 */
export function getFeeBpsForPrice(
  unitPricePaise: number,
  tiers: FeeTiers = DEFAULT_FEE_TIERS,
): number {
  if (unitPricePaise < tiers.tier1MaxPaise) return tiers.tier1Bps;
  if (unitPricePaise <= tiers.tier2MaxPaise) return tiers.tier2Bps;
  return tiers.tier3Bps;
}

export function platformFee(subtotalPaise: number, feeBps: number): number {
  return Math.round((subtotalPaise * feeBps) / 10_000);
}

/**
 * Default commission + convenience fee rates (in basis points).
 */
export const DEFAULT_COMMISSION_BPS = 1000;  // 10%
export const DEFAULT_CONVENIENCE_FEE_BPS = 200;  // 2%
/** Razorpay card/UPI blended rate — bundled into the buyer's fee line. */
export const DEFAULT_GATEWAY_FEE_BPS = 236;  // 2.36%

export interface EventFeeConfig {
  commissionBps: number;
  commissionEnabled: boolean;
  convenienceFeeBps: number;
  convenienceFeeEnabled: boolean;
  /** Gateway fee bps — defaults to DEFAULT_GATEWAY_FEE_BPS. */
  gatewayFeeBps?: number;
}

/**
 * Gateway fee gross-up: the fee is applied to the *collected* total
 * (subtotal + convenience + gateway itself), so solving for the fee on the
 * base alone needs the 10000−bps denominator. Same formula as the
 * create_reserved_order RPC — keep them in lockstep.
 */
export function gatewayFeePaise(
  subtotalPaise: number,
  convenienceFeePaise: number,
  bps: number = DEFAULT_GATEWAY_FEE_BPS,
): number {
  if (bps <= 0) return 0;
  return Math.round((subtotalPaise + convenienceFeePaise) * bps / (10_000 - bps));
}

/** Total fee the buyer pays on top of face value (convenience + gateway). */
export function buyerFeePaise(breakdown: PriceBreakdown): number {
  return breakdown.convenienceFeePaise + breakdown.gatewayFeePaise;
}

/** Refund basis — BMS model refunds ticket price; FULL covers everything. */
export function refundableAmountPaise(
  breakdown: PriceBreakdown,
  scope: "TICKET_PRICE" | "FULL",
): number {
  return scope === "FULL" ? breakdown.totalPaise : breakdown.subtotalPaise;
}

/**
 * Calculate price with the new dual-fee model:
 *   - Buyer pays: subtotal + convenience fee
 *   - Organizer receives: subtotal - commission
 *   - Platform keeps: commission + convenience fee
 *
 * For free events (unitPricePaise = 0), all fees are 0.
 *
 * Falls back to legacy feePayer model if no fee config is provided.
 */
export function calculatePrice(
  unitPricePaise: number,
  quantity: number,
  feePayer: FeePayer,
  feeBps?: number,
  feeConfig?: EventFeeConfig | null,
): PriceBreakdown {
  const subtotalPaise = unitPricePaise * quantity;
  const grossRevenuePaise = subtotalPaise;

  // Free events: no fees at all
  if (unitPricePaise === 0) {
    return {
      subtotalPaise: 0,
      platformFeePaise: 0,
      commissionPaise: 0,
      convenienceFeePaise: 0,
      gatewayFeePaise: 0,
      grossRevenuePaise: 0,
      feeBps: 0,
      totalPaise: 0,
      organizerPayoutPaise: 0,
      feePayer,
    };
  }

  // Dual-fee model + gateway fee (BUYER pays it; ORGANIZER absorbs it).
  if (feeConfig) {
    const commissionPaise = feeConfig.commissionEnabled
      ? platformFee(subtotalPaise, feeConfig.commissionBps)
      : 0;
    const convenienceFeePaise = feeConfig.convenienceFeeEnabled
      ? platformFee(subtotalPaise, feeConfig.convenienceFeeBps)
      : 0;
    // Gateway fee is bundled into the convenience-fee line — it only applies
    // when convenience fees apply (box-office cash orders have neither).
    const gatewayPaise = feeConfig.convenienceFeeEnabled
      ? gatewayFeePaise(subtotalPaise, convenienceFeePaise, feeConfig.gatewayFeeBps)
      : 0;
    const organizerPays = feePayer === "ORGANIZER";

    return {
      subtotalPaise,
      platformFeePaise: commissionPaise + convenienceFeePaise,
      commissionPaise,
      convenienceFeePaise,
      gatewayFeePaise: gatewayPaise,
      grossRevenuePaise,
      feeBps: feeConfig.commissionBps,
      totalPaise: organizerPays
        ? subtotalPaise
        : subtotalPaise + convenienceFeePaise + gatewayPaise,
      organizerPayoutPaise: organizerPays
        ? subtotalPaise - commissionPaise - convenienceFeePaise - gatewayPaise
        : subtotalPaise - commissionPaise,
      feePayer,
    };
  }

  // Legacy model: tiered fee with feePayer (no gateway fee — pre-Razorpay).
  const effectiveFeeBps = feeBps ?? getFeeBpsForPrice(unitPricePaise);
  const platformFeePaise = platformFee(subtotalPaise, effectiveFeeBps);

  return {
    subtotalPaise,
    platformFeePaise,
    commissionPaise: 0,
    convenienceFeePaise: 0,
    gatewayFeePaise: 0,
    grossRevenuePaise,
    feeBps: effectiveFeeBps,
    totalPaise:
      feePayer === "BUYER" ? subtotalPaise + platformFeePaise : subtotalPaise,
    organizerPayoutPaise:
      feePayer === "BUYER" ? subtotalPaise : subtotalPaise - platformFeePaise,
    feePayer,
  };
}
