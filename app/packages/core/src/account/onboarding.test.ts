import { describe, expect, it } from "vitest";
import { FIRST_PLANT_STEPS, isNewAccount, startAction } from "./onboarding";

const NOTHING = { specimens: 0, archivedSpecimens: 0 };

describe("US-ONB-01 start with the first plant", () => {
  it("US-ONB-01 the flow has at most 3 steps and asks for no location and no light zone", () => {
    expect(FIRST_PLANT_STEPS.length).toBeLessThanOrEqual(3);
    expect(FIRST_PLANT_STEPS.map((s) => s.id)).toEqual(["species", "save"]);
    for (const s of FIRST_PLANT_STEPS) expect(s.title + s.nextAction).not.toMatch(/Standort/);
  });

  it("US-ONB-01 every step hint is short: at most 12 words", () => {
    for (const s of FIRST_PLANT_STEPS)
      expect(s.nextAction.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});

describe("US-ACC-03 guided onboarding", () => {
  it("US-ACC-03 without a plant the start page names the first plant as the next action", () => {
    const a = startAction(NOTHING);
    expect(a?.id).toBe("first_plant");
    expect(a?.nextAction).toMatch(/Art/);
  });

  it("US-ACC-03 with a plant there is no start action anymore", () => {
    expect(startAction({ specimens: 1, archivedSpecimens: 0 })).toBeNull();
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
    expect(startAction({ specimens: 1, archivedSpecimens: 3 })).toBeNull();
  });
});
