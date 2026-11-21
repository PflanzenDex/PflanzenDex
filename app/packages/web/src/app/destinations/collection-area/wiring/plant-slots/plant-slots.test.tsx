// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
import { plantSlots } from "./plant-slots";

afterEach(cleanup);

const card = (extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
  id: "e1",
  name: "Aloe",
  speciesId: "a1",
  marker: null,
  speciesName: "Aloe vera",
  status: "plant",
  location: "Regal Süd",
  lightZone: "Zone 3",
  lightZoneSource: "location",
  lightNeedUnknown: false,
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  provenance: null,
  moreTreatments: 0,
  ...extra,
});
const MEASURED = card({
  lastMeasurement: { date: "2026-10-01", value: 12, quality: "healthy", note: null },
});

const slots = plantSlots("http://api.test", async () => "tok");
const sizers = (root: ParentNode) =>
  root.querySelectorAll('div[aria-hidden="true"].invisible > p').length;

describe("US-QS-23 the app tells the growth line whether the plant has a measurement (issue 2384)", () => {
  it("US-QS-23 the growth part gets measured=false for a card without a measurement, and true for one with it", () => {
    const growth = (c: SpecimenCard) =>
      (slots.growth?.(c, { measure: () => undefined }) as ReactElement<{ measured: boolean }>).props
        .measured;
    expect(growth(card())).toBe(false);
    expect(growth(MEASURED)).toBe(true);
  });

  it("US-QS-23 the growth fallback reserves one line for a card without a measurement and every reading for one with it", () => {
    const fallback = (c: SpecimenCard) =>
      sizers(render(<>{slots.growthFallback?.("Lädt …", c)}</>).container);
    expect(fallback(card())).toBe(1);
    cleanup();
    expect(fallback(MEASURED)).toBeGreaterThan(1);
  });
});
