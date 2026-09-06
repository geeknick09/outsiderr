import type { FeePayer } from "@/lib/types";

export interface PriceBreakdown {
  /** Face value of the tickets: unit price x quantity. */
  subtotalPaise: number;
  /** Platform commission (tiered based on ticket price). */
  platformFeePaise: number;
  /** Organizer commission deducted from payout. */
  commissionPaise: number;
  /** Buyer convenience fee added on top. */
  convenienceFeePaise: number;
  /** What the buyer actually transfers over UPI. */
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

export interface EventFeeConfig {
  commissionBps: number;
  commissionEnabled: boolean;
  convenienceFeeBps: number;
  convenienceFeeEnabled: boolean;
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
      grossRevenuePaise: 0,
      feeBps: 0,
      totalPaise: 0,
      organizerPayoutPaise: 0,
      feePayer,
    };
  }

  // New dual-fee model
  if (feeConfig) {
    const commissionPaise = feeConfig.commissionEnabled
      ? platformFee(subtotalPaise, feeConfig.commissionBps)
      : 0;
    const convenienceFeePaise = feeConfig.convenienceFeeEnabled
      ? platformFee(subtotalPaise, feeConfig.convenienceFeeBps)
      : 0;

    return {
      subtotalPaise,
      platformFeePaise: commissionPaise + convenienceFeePaise,
      commissionPaise,
      convenienceFeePaise,
      grossRevenuePaise,
      feeBps: feeConfig.commissionBps,
      totalPaise: subtotalPaise + convenienceFeePaise,
      organizerPayoutPaise: subtotalPaise - commissionPaise,
      feePayer,
    };
  }

  // Legacy model: tiered fee with feePayer
  const effectiveFeeBps = feeBps ?? getFeeBpsForPrice(unitPricePaise);
  const platformFeePaise = platformFee(subtotalPaise, effectiveFeeBps);

  return {
    subtotalPaise,
    platformFeePaise,
    commissionPaise: 0,
    convenienceFeePaise: 0,
    grossRevenuePaise,
    feeBps: effectiveFeeBps,
    totalPaise:
      feePayer === "BUYER" ? subtotalPaise + platformFeePaise : subtotalPaise,
    organizerPayoutPaise:
      feePayer === "BUYER" ? subtotalPaise : subtotalPaise - platformFeePaise,
    feePayer,
  };
}
