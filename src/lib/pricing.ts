import { PLATFORM_FEE_BPS } from "@/lib/constants";
import type { FeePayer } from "@/lib/types";

export interface PriceBreakdown {
  /** Face value of the tickets: unit price x quantity. */
  subtotalPaise: number;
  /** 5% platform commission. */
  platformFeePaise: number;
  /** What the buyer actually transfers over UPI. */
  totalPaise: number;
  /** What the organizer receives once the order is confirmed. */
  organizerPayoutPaise: number;
  feePayer: FeePayer;
}

export function platformFee(subtotalPaise: number): number {
  return Math.round((subtotalPaise * PLATFORM_FEE_BPS) / 10_000);
}

/**
 * BUYER  -> the 5% fee is added on top of the ticket price.
 * ORGANIZER -> the buyer pays the listed price and the fee is deducted from the payout.
 */
export function calculatePrice(
  unitPricePaise: number,
  quantity: number,
  feePayer: FeePayer,
): PriceBreakdown {
  const subtotalPaise = unitPricePaise * quantity;
  const platformFeePaise = platformFee(subtotalPaise);

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
