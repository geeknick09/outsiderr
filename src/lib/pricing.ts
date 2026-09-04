import type { FeePayer } from "@/lib/types";

export interface PriceBreakdown {
  /** Face value of the tickets: unit price x quantity. */
  subtotalPaise: number;
  /** Platform commission (tiered based on ticket price). */
  platformFeePaise: number;
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
 * BUYER  -> the platform fee is added on top of the ticket price.
 * ORGANIZER -> the buyer pays the listed price and the fee is deducted from the payout.
 *
 * Uses tiered fee based on the per-ticket price.
 */
export function calculatePrice(
  unitPricePaise: number,
  quantity: number,
  feePayer: FeePayer,
  feeBps?: number,
): PriceBreakdown {
  const subtotalPaise = unitPricePaise * quantity;
  const grossRevenuePaise = subtotalPaise;

  // Use tiered fee if feeBps is not provided, otherwise use the provided flat fee
  const effectiveFeeBps = feeBps ?? getFeeBpsForPrice(unitPricePaise);
  const platformFeePaise = platformFee(subtotalPaise, effectiveFeeBps);

  return {
    subtotalPaise,
    platformFeePaise,
    grossRevenuePaise,
    feeBps: effectiveFeeBps,
    totalPaise:
      feePayer === "BUYER" ? subtotalPaise + platformFeePaise : subtotalPaise,
    organizerPayoutPaise:
      feePayer === "BUYER" ? subtotalPaise : subtotalPaise - platformFeePaise,
    feePayer,
  };
}
