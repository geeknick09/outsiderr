import type { TicketTier } from "@/lib/types";

/**
 * Calculate carry-forward and effective available for each flat phase tier.
 *
 * Phases are sequential (ordered by phaseOrder). Unsold tickets from
 * previous phases carry forward to the next phase.
 *
 * A phase ends when EITHER:
 *   - Its phase_closes_at is reached, OR
 *   - It's sold out (effective_available <= 0)
 *
 * The "active" phase is the first one that:
 *   - Has opened (now >= phase_opens_at, or phase_opens_at is null)
 *   - Has not closed (now < phase_closes_at, or phase_closes_at is null)
 *   - Has effective_available > 0
 *
 * If no phase matches (all sold out or all closed), the last phase is
 * returned as active (for display purposes, showing "sold out").
 */

export interface PhaseWithAvailability {
  tier: TicketTier;
  carryForward: number;
  effectiveQuantity: number;
  effectiveAvailable: number;
  isActive: boolean;
  isPast: boolean;
  isUpcoming: boolean;
  status: "UPCOMING" | "ACTIVE" | "SOLD_OUT" | "CLOSED";
}

export function computePhaseAvailability(
  tiers: TicketTier[],
  now: Date = new Date(),
): PhaseWithAvailability[] {
  const phases = tiers
    .filter((t) => t.tierType === "FLAT_PHASE")
    .sort((a, b) => (a.phaseOrder ?? 0) - (b.phaseOrder ?? 0));

  if (phases.length === 0) return [];

  const nowMs = now.getTime();
  let carryForward = 0;
  let activeFound = false;

  return phases.map((tier) => {
    const opensAt = tier.phaseOpensAt ? new Date(tier.phaseOpensAt).getTime() : null;
    const closesAt = tier.phaseClosesAt ? new Date(tier.phaseClosesAt).getTime() : null;

    const effectiveQuantity = tier.quantity + carryForward;
    const effectiveAvailable = effectiveQuantity - tier.quantitySold;
    const isUpcoming = opensAt !== null && nowMs < opensAt;
    const isPast = closesAt !== null && nowMs >= closesAt;
    const isSoldOut = effectiveAvailable <= 0;

    // Determine if this is the active phase
    const hasOpened = opensAt === null || nowMs >= opensAt;
    const hasNotClosed = closesAt === null || nowMs < closesAt;
    const isActive = !activeFound && hasOpened && hasNotClosed && !isSoldOut;

    if (isActive) activeFound = true;

    // Update carry-forward for next phase: carry the EFFECTIVE unsold
    // (includes carry-forward from previous phases, not just this tier's own unsold)
    carryForward = Math.max(0, effectiveAvailable);

    let status: PhaseWithAvailability["status"];
    if (isUpcoming) status = "UPCOMING";
    else if (isActive) status = "ACTIVE";
    else if (isSoldOut) status = "SOLD_OUT";
    else status = "CLOSED";

    return {
      tier,
      carryForward: effectiveQuantity - tier.quantity,
      effectiveQuantity,
      effectiveAvailable: Math.max(0, effectiveAvailable),
      isActive,
      isPast,
      isUpcoming,
      status,
    };
  });
}

/**
 * Get the currently active flat phase tier, or null if none is active.
 */
export function getActivePhase(tiers: TicketTier[], now: Date = new Date()): TicketTier | null {
  const phases = computePhaseAvailability(tiers, now);
  const active = phases.find((p) => p.isActive);
  return active ? active.tier : null;
}

/**
 * Get the effective available quantity for a specific tier.
 * For FLAT_PHASE tiers, this includes carry-forward from previous phases.
 * For NAMED tiers, this is just quantity - quantitySold.
 */
export function getEffectiveAvailable(tier: TicketTier, allTiers: TicketTier[]): number {
  if (tier.tierType !== "FLAT_PHASE") {
    return Math.max(0, tier.quantity - tier.quantitySold);
  }
  const phases = computePhaseAvailability(allTiers);
  const phase = phases.find((p) => p.tier.id === tier.id);
  return phase ? phase.effectiveAvailable : Math.max(0, tier.quantity - tier.quantitySold);
}

/**
 * Get the tiers that should be shown to users for booking.
 * - The currently active flat phase (if any)
 * - All named tiers (NAMED type) that have availability
 */
export function getBookableTiers(tiers: TicketTier[], now: Date = new Date()): TicketTier[] {
  const named = tiers.filter((t) => t.tierType !== "FLAT_PHASE");
  const activePhase = getActivePhase(tiers, now);

  const bookable = [...named];
  if (activePhase) bookable.push(activePhase);

  // Sort by sort order, with active phase at the top
  return bookable.sort((a, b) => {
    if (a.tierType === "FLAT_PHASE" && b.tierType !== "FLAT_PHASE") return -1;
    if (a.tierType !== "FLAT_PHASE" && b.tierType === "FLAT_PHASE") return 1;
    return a.sortOrder - b.sortOrder;
  });
}
