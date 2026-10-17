import { describe, expect, it } from "vitest";
import { occasionsOf } from "../test-helpers";
import { REMINDER_OCCASIONS, type Occasion, type OccasionSource } from "../types";

const NOW = new Date("2026-10-10T06:00:00Z");

/**
 * Contract of the port `OccasionSource` (ADR 0003, FR-MON-03): every adapter answers with occasions that name their kind,
 * carry a stable id (the same cause has the same id on every day, so a day is never reported twice) and say what to do
 * next (P-09). `seed` makes the source hold exactly the given causes; the adapter under test brings its own data.
 */
export function occasionSourceContract(
  name: string,
  make: () => Promise<{ source: OccasionSource; userId: string }>,
) {
  describe(`OccasionSource contract · ${name}`, () => {
    it("FR-MON-03 answers occasions of a known kind, with unique stable ids, text and next action", async () => {
      const { source, userId } = await make();
      const first = await source.occasions(userId, "Europe/Berlin", NOW);
      const again = await source.occasions(userId, "Europe/Berlin", NOW);
      expect(again.map((o) => o.id)).toEqual(first.map((o) => o.id));
      expect(new Set(first.map((o) => o.id)).size).toBe(first.length);
      for (const o of first) {
        expect(REMINDER_OCCASIONS).toContain(o.occasion);
        expect(o.text.length).toBeGreaterThan(0);
        expect(o.nextAction.length).toBeGreaterThan(0);
      }
    });
  });
}

const sample: Occasion = {
  id: "treatment:1",
  occasion: "treatment",
  text: "Fällig.",
  nextAction: "Behandeln.",
};
occasionSourceContract("in-memory", async () => ({
  source: occasionsOf([sample]),
  userId: "anna",
}));
