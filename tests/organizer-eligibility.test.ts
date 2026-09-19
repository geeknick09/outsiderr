import { describe, expect, it } from "vitest";

import {
  getOrganizerAccessState,
  type OrganizerAccessState,
} from "@/lib/organizer-eligibility";

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
});
