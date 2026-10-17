import { describe, expect, it } from "vitest";
import { isNewAccount, onboardingHints, onboardingSteps, startAction } from "./onboarding";

const NOTHING = { locations: 0, zones: 0, specimens: 0, archivedSpecimens: 0 };

describe("US-ACC-03 guided onboarding", () => {
  it("US-ACC-03 asks for locations, light zones and the first plant, in this order", () => {
    expect(onboardingSteps(NOTHING).map((s) => s.id)).toEqual([
      "locations",
      "zones",
      "first_plant",
    ]);
  });

  it("US-ACC-03 a step is done as soon as the account has something of it; nothing is stored", () => {
    const steps = onboardingSteps({ locations: 2, zones: 0, specimens: 1, archivedSpecimens: 0 });
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ["locations", true],
      ["zones", false],
      ["first_plant", true],
    ]);
  });

  it("US-ACC-03 without a plant the start page names the first plant as the next action", () => {
    const a = startAction(NOTHING);
    expect(a?.id).toBe("first_plant");
    expect(a?.nextAction).toMatch(/Art/);
  });

  it("US-ACC-03 every step and hint carries the label of the button that does it, in one place", () => {
    expect(onboardingSteps(NOTHING).map((s) => s.actionLabel)).toEqual([
      "Standorte anlegen",
      "Lichtzonen einrichten",
      "Art im Katalog wählen",
    ]);
    expect(
      onboardingHints({ locations: 0, zones: 0, specimens: 1, archivedSpecimens: 0 }).map(
        (h) => h.actionLabel,
      ),
    ).toEqual(["Standorte anlegen", "Lichtzonen einrichten"]);
  });

  it("US-ACC-03 with a plant there is no start action anymore", () => {
    expect(startAction({ locations: 0, zones: 0, specimens: 1, archivedSpecimens: 0 })).toBeNull();
  });

  it("US-ACC-03 skipped details come back as a hint, never as an error", () => {
    const hints = onboardingHints({ locations: 0, zones: 0, specimens: 1, archivedSpecimens: 0 });
    expect(hints.map((h) => h.id)).toEqual(["locations", "zones"]);
    for (const h of hints) {
      expect(h.text.length).toBeGreaterThan(0);
      expect(h.nextAction.length).toBeGreaterThan(0);
    }
  });

  it("US-ACC-03 no hint for details that exist, and none for the plant (that is the start action)", () => {
    expect(onboardingHints({ locations: 1, zones: 4, specimens: 0, archivedSpecimens: 0 })).toEqual(
      [],
    );
  });

  it("US-ACC-03 an account with only archived plants is a returning keeper, not a new account (#291)", () => {
    expect(isNewAccount(NOTHING)).toBe(true);
    expect(isNewAccount({ ...NOTHING, archivedSpecimens: 2 })).toBe(false);
    expect(isNewAccount({ ...NOTHING, specimens: 1 })).toBe(false);
  });

  it("US-ACC-03 a returning keeper without an active plant gets the next plant as the one next action (P-09)", () => {
    const a = startAction({ ...NOTHING, archivedSpecimens: 3 });
    expect(a).toMatchObject({
      id: "first_plant",
      title: "Nächste Pflanze",
      actionLabel: "Art im Katalog wählen",
    });
    expect(a?.nextAction).toMatch(/archiviert/);
    expect(startAction({ ...NOTHING, specimens: 1, archivedSpecimens: 3 })).toBeNull();
  });
});
