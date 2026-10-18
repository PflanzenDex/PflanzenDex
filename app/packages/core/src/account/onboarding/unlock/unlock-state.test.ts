import { describe, expect, it } from "vitest";
import { ALL_FEATURES, NO_FEATURES, knownFeatures } from "../../../kernel";
import { UNLOCK_FUNCTIONS, UNLOCK_FUNCTION_IDS } from "./unlock-registry";
import {
  addDays,
  unlockState,
  unlockStates,
  type UnlockInput,
  type UnlockStatus,
} from "./unlock-state";

const FIRST = "2026-01-01";
const day = (n: number) => addDays(FIRST, n);

const input = (over: Partial<UnlockInput> = {}): UnlockInput => ({
  style: "few",
  activeSpecimens: 1,
  firstSpecimenDate: FIRST,
  today: day(0),
  calmMode: false,
  features: ALL_FEATURES,
  manualUnlocks: new Set(),
  existingData: new Set(),
  ...over,
});

const of = (id: string, i: UnlockInput): UnlockStatus => {
  const r = unlockState(id, i);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const state = (id: string, i: UnlockInput) => of(id, i).state;

describe("US-ONB-04 always open functions", () => {
  it.each(["today", "collection", "species_catalog", "light_zones"])(
    "US-ONB-04 %s is open for an account without any plant",
    (id) => {
      expect(state(id, input({ activeSpecimens: 0, firstSpecimenDate: null }))).toBe("open");
    },
  );
});

describe("US-ONB-04 first plant rule (measuring, photos, growth, treatments, Pokedex)", () => {
  const ids = ["measuring", "photos", "growth", "treatments", "pokedex"];
  it.each(ids)(
    "US-ONB-04 %s is locked without a plant, with the way to add the first one",
    (id) => {
      const s = of(id, input({ activeSpecimens: 0, firstSpecimenDate: null }));
      expect(s.state).toBe("locked");
      expect(s.reasons).toEqual([{ kind: "first_specimen" }]);
      expect(s.ways).toEqual([{ kind: "add_first_specimen" }]);
      expect(s.mayUnlockNow).toBe(true);
    },
  );
  it.each(ids)("US-ONB-04 %s is open with the first plant", (id) => {
    expect(state(id, input())).toBe("open");
  });
  it.each(ids)("US-ONB-04 %s stays open when the only plant was archived (history stays)", (id) => {
    expect(state(id, input({ activeSpecimens: 0 }))).toBe("open");
  });
});

describe("US-ONB-04 wishlist and discover: 28 days after the first plant, or 5 plants", () => {
  it.each(["wishlist", "discover"])("US-ONB-04 %s boundaries 4/5 plants", (id) => {
    expect(state(id, input({ activeSpecimens: 4 }))).toBe("locked");
    expect(state(id, input({ activeSpecimens: 5 }))).toBe("open");
  });
  it.each(["wishlist", "discover"])("US-ONB-04 %s boundaries day 27/28/29", (id) => {
    expect(state(id, input({ today: day(27) }))).toBe("locked");
    expect(state(id, input({ today: day(28) }))).toBe("open");
    expect(state(id, input({ today: day(29) }))).toBe("open");
  });
  it("US-ONB-04 the locked state names both ways as data: missing plants and the unlock date", () => {
    const s = of("wishlist", input({ activeSpecimens: 2, today: day(10) }));
    expect(s.reasons).toEqual([
      { kind: "days_since_first_specimen", needed: 28, have: 10 },
      { kind: "specimens", needed: 5, have: 2 },
    ]);
    expect(s.ways).toEqual([
      { kind: "wait", days: 18, unlockDate: day(28) },
      { kind: "add_specimens", missing: 3 },
    ]);
  });
  it("US-ONB-04 the unlock date respects the leap day: first plant 2028-02-01 opens on 2028-02-29", () => {
    const i = input({ firstSpecimenDate: "2028-02-01", today: "2028-02-28" });
    expect(of("wishlist", i).ways[0]).toEqual({ kind: "wait", days: 1, unlockDate: "2028-02-29" });
    expect(state("wishlist", { ...i, today: "2028-02-29" })).toBe("open");
  });
  it("US-ONB-04 days count from the first specimen ever created even if it is archived", () => {
    expect(state("wishlist", input({ activeSpecimens: 1, today: day(28) }))).toBe("open");
  });
  it("US-ONB-04 without a first specimen the days are unknown, never invented (P-08)", () => {
    const s = of("wishlist", input({ activeSpecimens: 0, firstSpecimenDate: null }));
    expect(s.reasons[0]).toEqual({ kind: "days_since_first_specimen", needed: 28, have: null });
    expect(s.ways[0]).toEqual({ kind: "add_first_specimen" });
  });
});

describe("US-ONB-04 equipment: 3 plants, or 28 days; switch recommendations", () => {
  it("US-ONB-04 boundaries 2/3 plants and day 27/28", () => {
    expect(state("equipment", input({ activeSpecimens: 2 }))).toBe("locked");
    expect(state("equipment", input({ activeSpecimens: 3 }))).toBe("open");
    expect(state("equipment", input({ today: day(27) }))).toBe("locked");
    expect(state("equipment", input({ today: day(28) }))).toBe("open");
  });
  it("US-ONB-04 switched off is its own state and not announced", () => {
    const s = of(
      "equipment",
      input({ activeSpecimens: 9, features: knownFeatures(["social", "ai"]) }),
    );
    expect(s).toMatchObject({ state: "switched_off", announced: false, mayUnlockNow: false });
  });
});

describe("US-ONB-04 friends, swapping, AI: 5 plants, each with its switch", () => {
  it.each([
    ["friends", "social"],
    ["swapping", "social"],
    ["ai_access", "ai"],
  ])("US-ONB-04 %s boundaries 4/5 plants", (id) => {
    expect(state(id, input({ activeSpecimens: 4, today: day(400) }))).toBe("locked");
    expect(state(id, input({ activeSpecimens: 5 }))).toBe("open");
  });
  it.each([
    ["friends", "social"],
    ["swapping", "social"],
    ["ai_access", "ai"],
  ])("US-ONB-04 %s with switch %s off is switched_off whatever else is true", (id, feature) => {
    const features = knownFeatures(
      ["social", "ai", "recommendations"].filter((f) => f !== feature),
    );
    const all = {
      style: "many",
      activeSpecimens: 50,
      manualUnlocks: new Set([id]),
      existingData: new Set([id]),
      features,
    } as const;
    expect(state(id, input(all))).toBe("switched_off");
  });
  it("US-ONB-04 an invitation or a friend (existing data) opens friends below 5 plants", () => {
    expect(state("friends", input({ existingData: new Set(["friends"]) }))).toBe("open");
  });
});

describe("US-ONB-04 achievements rules and calm mode", () => {
  it("US-ONB-04 care rhythm opens at day 28", () => {
    expect(state("care_rhythm", input({ today: day(27) }))).toBe("locked");
    expect(state("care_rhythm", input({ today: day(28) }))).toBe("open");
  });
  it.each(["anniversaries", "year_in_review"])("US-ONB-04 %s boundaries day 364/365/366", (id) => {
    expect(state(id, input({ today: day(364) }))).toBe("locked");
    expect(of(id, input({ today: day(364) })).ways).toEqual([
      { kind: "wait", days: 1, unlockDate: day(365) },
    ]);
    expect(state(id, input({ today: day(365) }))).toBe("open");
    expect(state(id, input({ today: day(366) }))).toBe("open");
  });
  it.each(["care_rhythm", "anniversaries", "year_in_review"])(
    "US-ONB-04 %s: calm mode only removes the announcement, the state is the same",
    (id) => {
      for (const today of [day(0), day(28), day(400)]) {
        const calm = of(id, input({ calmMode: true, today }));
        const normal = of(id, input({ calmMode: false, today }));
        expect(calm.announced).toBe(false);
        expect(normal.announced).toBe(true);
        expect({ ...calm, announced: true }).toEqual(normal);
      }
    },
  );
  it("US-ONB-04 calm mode changes nothing for functions outside ACH", () => {
    const a = unlockStates(input({ calmMode: true })).filter(
      (s) => !["care_rhythm", "anniversaries", "year_in_review"].includes(s.id),
    );
    const b = unlockStates(input({ calmMode: false })).filter(
      (s) => !["care_rhythm", "anniversaries", "year_in_review"].includes(s.id),
    );
    expect(a).toEqual(b);
  });
});

describe("US-ONB-04 style many, manual unlocks and existing data", () => {
  it("US-ONB-04 style many opens every function the operator has not switched off", () => {
    const empty = { style: "many", activeSpecimens: 0, firstSpecimenDate: null } as const;
    expect(
      unlockStates(input({ ...empty, features: ALL_FEATURES })).every((s) => s.state === "open"),
    ).toBe(true);
    const off = unlockStates(input({ ...empty, features: NO_FEATURES }));
    for (const s of off) {
      const f = UNLOCK_FUNCTIONS.find((x) => x.id === s.id);
      expect(s.state).toBe(f && "feature" in f ? "switched_off" : "open");
    }
  });
  it("US-ONB-04 a manual unlock opens a function regardless of the rule", () => {
    expect(state("year_in_review", input({ manualUnlocks: new Set(["year_in_review"]) }))).toBe(
      "open",
    );
  });
  it("US-ONB-04 existing data opens a function regardless of the rule", () => {
    expect(state("wishlist", input({ existingData: new Set(["wishlist"]) }))).toBe("open");
  });
  it("US-ONB-04 a locked function can always be opened by tap", () => {
    expect(of("year_in_review", input()).mayUnlockNow).toBe(true);
  });
});

describe("US-ONB-04 determinism and registry", () => {
  it("US-ONB-04 the same input and the same date give the same result", () => {
    expect(unlockStates(input({ today: day(40) }))).toEqual(
      unlockStates(input({ today: day(40) })),
    );
  });
  it("US-ONB-04 the result lists every registry function once, in registry order", () => {
    expect(unlockStates(input()).map((s) => s.id)).toEqual(UNLOCK_FUNCTION_IDS);
    expect(new Set(UNLOCK_FUNCTION_IDS).size).toBe(UNLOCK_FUNCTION_IDS.length);
  });
  it("US-ONB-04 an unknown function id refuses with a stable code and is not open", () => {
    const r = unlockState("teleport", input());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("onboarding.unknown_function");
  });
  it("US-ONB-04 the day counts the calendar, not hours (month end, no clock)", () => {
    expect(addDays("2026-01-31", 28)).toBe("2026-02-28");
    expect(
      of("care_rhythm", input({ firstSpecimenDate: "2026-01-31", today: "2026-02-27" })).ways,
    ).toEqual([{ kind: "wait", days: 1, unlockDate: "2026-02-28" }]);
  });
});
