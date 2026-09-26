import { describe, expect, it } from "vitest";

import {
  getOrganizerAccessState,
  computePendingKyc,
  type OrganizerAccessState,
} from "@/modules/shared";

describe("organizer access eligibility", () => {
  it("allows approved organizers through", () => {
    const state = getOrganizerAccessState({ kycStatus: "APPROVED", rejectionCount: 0, rejectionLimit: 5 });
    expect(state).toMatchObject({ eligible: true, blocked: false, canResubmit: false } satisfies Partial<OrganizerAccessState>);
  });

  it("lets a rejected organizer resubmit while under the cap", () => {
    const state = getOrganizerAccessState({ kycStatus: "REJECTED", rejectionCount: 2, rejectionLimit: 5 });
    expect(state).toMatchObject({ eligible: false, blocked: false, canResubmit: true } satisfies Partial<OrganizerAccessState>);
  });

  it("blocks profiles that have hit the rejection cap", () => {
    const state = getOrganizerAccessState({ kycStatus: "REJECTED", rejectionCount: 5, rejectionLimit: 5 });
    expect(state).toMatchObject({ eligible: false, blocked: true, canResubmit: false } satisfies Partial<OrganizerAccessState>);
  });

  it("treats an invalid/non-positive limit as the default 5", () => {
    const negative = getOrganizerAccessState({ kycStatus: "REJECTED", rejectionCount: 5, rejectionLimit: -3 });
    expect(negative).toMatchObject({ blocked: true, rejectionLimit: 5 });
    const zero = getOrganizerAccessState({ kycStatus: "REJECTED", rejectionCount: 0, rejectionLimit: 0 });
    expect(zero).toMatchObject({ blocked: false, rejectionLimit: 5 });
  });
});

describe("computePendingKyc", () => {
  const base = {
    pan_number: { value: undefined, current: "AAAAA1234A" },
    bank_ifsc: { value: undefined, current: "HDFC0001234" },
  };

  it("stages only fields that differ from the verified value", () => {
    const out = computePendingKyc({
      existing: null,
      values: {
        pan_number: { value: "BBBBB5678B", current: "AAAAA1234A" },
        bank_ifsc: { value: "HDFC0001234", current: "HDFC0001234" },
      },
    });
    expect(out).toEqual({ pan_number: "BBBBB5678B" });
  });

  it("ignores fields not present in the input", () => {
    const out = computePendingKyc({ existing: null, values: base });
    expect(out).toEqual({});
  });

  it("merges with an existing change-set", () => {
    const out = computePendingKyc({
      existing: { pan_number: "BBBBB5678B" },
      values: {
        ...base,
        bank_ifsc: { value: "ICIC0009876", current: "HDFC0001234" },
      },
    });
    expect(out).toEqual({ pan_number: "BBBBB5678B", bank_ifsc: "ICIC0009876" });
  });

  it("drops a staged field reverted back to the verified value", () => {
    const out = computePendingKyc({
      existing: { pan_number: "BBBBB5678B" },
      values: {
        ...base,
        pan_number: { value: "AAAAA1234A", current: "AAAAA1234A" },
      },
    });
    expect(out).toEqual({});
  });
});
