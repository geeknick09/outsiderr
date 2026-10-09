import { describe, it, expect } from "vitest";
import { computeBadges } from "@/modules/shared";

const base = { attendedTotal: 0 };

describe("badge ladder", () => {
  it("no badges for zero attendance", () => {
    expect(computeBadges(base)).toEqual([]);
  });
  it("FIRST_EVENT at 1", () => {
    expect(computeBadges({ attendedTotal: 1 }).map(b => b.key)).toEqual(["FIRST_EVENT"]);
  });
  it("attendance ladder unlocks cumulatively", () => {
    const keys = computeBadges({ attendedTotal: 10 }).map(b => b.key);
    expect(keys).toEqual(["FIRST_EVENT", "REGULAR", "FIVE_STRONG", "TEN_STRONG"]);
  });
  it("CHAMPION needs 15 attended within one community", () => {
    expect(computeBadges({ attendedTotal: 15, attendedInCommunity: 15 }).map(b => b.key)).toContain("CHAMPION");
    expect(computeBadges({ attendedTotal: 20, attendedInCommunity: 14 }).map(b => b.key)).not.toContain("CHAMPION");
  });
  it("FOUNDING + CONNECTOR flags", () => {
    expect(computeBadges({ attendedTotal: 0, foundingMember: true }).map(b => b.key)).toContain("FOUNDING");
    expect(computeBadges({ attendedTotal: 0, referrals: 3 }).map(b => b.key)).toContain("CONNECTOR");
  });
  it("six-level cap is not exceeded (7 defs, badge output is additive)", () => {
    const keys = computeBadges({ attendedTotal: 50, attendedInCommunity: 20, referrals: 10, foundingMember: true }).map(b => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeLessThanOrEqual(7);
  });
});
