import type { FeePayer } from "@/lib/types";

export interface PriceBreakdown {
  /** Face value of the tickets: unit price x quantity. */
  subtotalPaise: number;
  /** Platform commission (configurable via admin settings). */
  platformFeePaise: number;
  /** What the buyer actually transfers over UPI. */
  totalPaise: number;
  /** What the organizer receives once the order is confirmed. */
  organizerPayoutPaise: number;
  feePayer: FeePayer;
}

export function platformFee(subtotalPaise: number, feeBps: number): number {
  return Math.round((subtotalPaise * feeBps) / 10_000);
}

/**
 * BUYER  -> the platform fee is added on top of the ticket price.
 * ORGANIZER -> the buyer pays the listed price and the fee is deducted from the payout.
 */
export function calculatePrice(
  unitPricePaise: number,
  quantity: number,
  feePayer: FeePayer,
  feeBps: number,
): PriceBreakdown {
  const subtotalPaise = unitPricePaise * quantity;
  const platformFeePaise = platformFee(subtotalPaise, feeBps);

  return {
    subtotalPaise,
    platformFeePaise,
    totalPaise:
      feePayer === "BUYER" ? subtotalPaise + platformFeePaise : subtotalPaise,
    organizerPayoutPaise:
      feePayer === "BUYER" ? subtotalPaise : subtotalPaise - platformFeePaise,
    feePayer,
  };
}
