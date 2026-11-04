/**
 * Release-scoped feature flags — hide features shipping in a later release.
 * Flip to true to re-enable; all call sites stay wired.
 */
export const RELEASE_FLAGS = {
  /** Guestlist entries + panel (event manage page, guests links). */
  guestlist: false,
  /** Featured & Boost: hero rotation, slot boosts, sponsored surfaces. */
  boost: false,
} as const;
