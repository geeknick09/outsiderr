import type { TicketTier } from "@/lib/types";

/**
 * Calculate carry-forward and effective available for each flat phase tier.
 *
 * Phases are sequential (ordered by phaseOrder). Unsold tickets from
 * previous phases carry forward to the next phase.
 *
 * RULES:
 *   - Phase 1 opens at its own phase_opens_at (or immediately if not set).
 *   - Phase N (N > 1) opens when the previous phase ENDS — regardless of
 *     its own phase_opens_at. The opens_at for phases 2+ is a planned/
 *     display time only.
 *   - A phase ENDS when EITHER:
 *       1. It's sold out (effective_available <= 0), OR
 *       2. Its time is over (now >= phase_closes_at, or now >= next
 *          phase's opens_at if no explicit closes_at)
 *   - Only ONE phase is active at a time.
 *   - If no phase is active (all ended), the last phase shows as sold out
 *     or closed for display purposes.
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
  // For phase 1, there's no previous phase to wait for — it's "ready"
  let prevPhaseEnded = true;

  return phases.map((tier, index) => {
    const opensAt = tier.phaseOpensAt ? new Date(tier.phaseOpensAt).getTime() : null;
    // If phaseClosesAt is not set, the phase implicitly closes when the NEXT phase opens
    const nextOpensAt = phases[index + 1]?.phaseOpensAt
      ? new Date(phases[index + 1].phaseOpensAt!).getTime()
      : null;
    const closesAt = tier.phaseClosesAt
      ? new Date(tier.phaseClosesAt).getTime()
      : nextOpensAt;

    const effectiveQuantity = tier.quantity + carryForward;
    const effectiveAvailable = effectiveQuantity - tier.quantitySold;
    const isSoldOut = effectiveAvailable <= 0;
    const isTimeOver = closesAt !== null && nowMs >= closesAt;

    // A phase has ended if it's sold out OR its time is over
    const hasEnded = isSoldOut || isTimeOver;

    // Phase 1 opens at its own opensAt (or immediately if not set).
    // Phase N (N > 1) opens when the previous phase has ended.
    const hasOpened = index === 0
      ? (opensAt === null || nowMs >= opensAt)
      : prevPhaseEnded;

    const hasNotClosed = closesAt === null || nowMs < closesAt;
    const isActive = hasOpened && hasNotClosed && !isSoldOut;

    // Remember for the next iteration whether this phase has ended
    prevPhaseEnded = hasEnded;

    // Update carry-forward for next phase: carry the EFFECTIVE unsold
    // (includes carry-forward from previous phases, not just this tier's own unsold)
    carryForward = Math.max(0, effectiveAvailable);

    const isUpcoming = !hasOpened && !isTimeOver;
    const isPast = isTimeOver && !isActive;

    let status: PhaseWithAvailability["status"];
    if (isActive) status = "ACTIVE";
    else if (isSoldOut) status = "SOLD_OUT";
    else if (isTimeOver) status = "CLOSED";
    else status = "UPCOMING";

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
