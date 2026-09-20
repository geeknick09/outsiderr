import { describe, expect, it } from "vitest";

import { isEventReadOnly, mergeOrganizerIntent } from "@/modules/shared";

describe("event lifecycle guards", () => {
  it("marks an event as read-only after it has started", () => {
    const now = new Date("2025-01-15T18:00:00Z").getTime();
    expect(
      isEventReadOnly("2025-01-15T17:00:00Z", now),
    ).toBe(true);
  });

  it("keeps future events editable", () => {
    const now = new Date("2025-01-15T12:00:00Z").getTime();
    expect(
      isEventReadOnly("2025-01-15T18:00:00Z", now),
    ).toBe(false);
  });

  it("merges organizer intent into the detailed profile text without duplicating blank values", () => {
    expect(mergeOrganizerIntent("We host cyphers.", "We run underground hip-hop nights and freestyle battles.")).toBe(
      "We host cyphers.\n\nWe run underground hip-hop nights and freestyle battles.",
    );
    expect(mergeOrganizerIntent("We host cyphers.", "")).toBe("We host cyphers.");
    expect(mergeOrganizerIntent("", "We run underground events.")).toBe("We run underground events.");
  });
});
