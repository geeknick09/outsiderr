import { describe, expect, it } from "vitest";

import {
  ALL_INDIAN_CITIES,
  INDIAN_STATES_CITIES,
  cityLabel,
  nearestIndianCity,
  normalizeCityKey,
} from "@/modules/shared";

describe("india-cities dataset", () => {
  it("every city is an Indian city inside India's bounding box", () => {
    for (const c of ALL_INDIAN_CITIES) {
      expect(c.lat).toBeGreaterThan(6);
      expect(c.lat).toBeLessThan(38);
      expect(c.lng).toBeGreaterThan(68);
      expect(c.lng).toBeLessThan(98);
      expect(c.value).toBe(c.value.toUpperCase());
      expect(c.label.length).toBeGreaterThan(1);
    }
  });

  it("has no duplicate city keys", () => {
    const values = ALL_INDIAN_CITIES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("every state has at least one city", () => {
    for (const s of INDIAN_STATES_CITIES) {
      expect(s.cities.length).toBeGreaterThan(0);
    }
  });

  it("keeps the legacy four cities", () => {
    for (const key of ["KOLKATA", "MUMBAI", "DELHI", "BENGALURU"]) {
      expect(ALL_INDIAN_CITIES.some((c) => c.value === key)).toBe(true);
    }
  });
});

describe("normalizeCityKey", () => {
  it("maps display labels to canonical keys", () => {
    expect(normalizeCityKey("Pune")).toBe("PUNE");
    expect(normalizeCityKey("pune")).toBe("PUNE");
    expect(normalizeCityKey("Navi Mumbai")).toBe("NAVI MUMBAI");
    // Goa is a state, not a listed city - passes through as its own key
    expect(normalizeCityKey("Goa")).toBe("GOA");
  });

  it("passes through unlisted names as uppercase keys", () => {
    expect(normalizeCityKey("Asansol")).toBe("ASANSOL");
    expect(normalizeCityKey("Some Small Town")).toBe("SOME SMALL TOWN");
  });

  it("resolves listed labels even with extra whitespace", () => {
    expect(normalizeCityKey("  silchar  ")).toBe("SILCHAR");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeCityKey("New   Delhi")).toBe("NEW DELHI");
  });
});

describe("cityLabel", () => {
  it("returns stored labels for listed cities", () => {
    expect(cityLabel("KOLKATA")).toBe("Kolkata");
    expect(cityLabel("PUNE")).toBe("Pune");
    expect(cityLabel("NAVI MUMBAI")).toBe("Navi Mumbai");
  });

  it("title-cases unlisted keys", () => {
    expect(cityLabel("ASANSOL")).toBe("Asansol");
    expect(cityLabel("PORT_BLAIR")).not.toBe("PORT_BLAIR"); // listed -> real label
    expect(cityLabel("SOME SMALL TOWN")).toBe("Some Small Town");
  });

  it("handles empty input", () => {
    expect(cityLabel("")).toBe("");
    expect(cityLabel(null)).toBe("");
    expect(cityLabel(undefined)).toBe("");
  });
});

describe("nearestIndianCity", () => {
  it("finds the closest listed city", () => {
    expect(nearestIndianCity(22.57, 88.36)?.value).toBe("KOLKATA");
    expect(nearestIndianCity(19.07, 72.87)?.value).toBe("MUMBAI");
    // A point near Pune but far from Mumbai still resolves to Pune
    expect(nearestIndianCity(18.52, 73.85)?.value).toBe("PUNE");
  });
});
