import { describe, expect, it } from "vitest";

import { partitionSearchEvents } from "@/modules/web";
import type { EventSummary } from "@/modules/shared";

function event(id: string, startsAt: string): EventSummary {
  return { id, startsAt } as EventSummary;
}

describe("partitionSearchEvents", () => {
  it("separates upcoming from past and orders each group chronologically", () => {
    const result = partitionSearchEvents([
      event("past-older", "2000-01-01T12:00:00.000Z"),
      event("future-later", "2099-06-01T12:00:00.000Z"),
      event("past-newer", "2020-01-01T12:00:00.000Z"),
      event("future-sooner", "2099-01-01T12:00:00.000Z"),
    ]);

    expect(result.upcoming.map(({ id }) => id)).toEqual(["future-sooner", "future-later"]);
    expect(result.past.map(({ id }) => id)).toEqual(["past-newer", "past-older"]);
  });
});
