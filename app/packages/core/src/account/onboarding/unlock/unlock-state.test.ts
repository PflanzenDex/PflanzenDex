import { describe, expect, it } from "vitest";
import { ALL_FEATURES, NO_FEATURES, knownFeatures } from "../../../kernel";
import {
  CORE_FUNCTION_IDS,
  KEEPER_SWITCH_IDS,
  UNLOCK_FUNCTIONS,
  UNLOCK_FUNCTION_IDS,
  keeperSwitchFunctions,
} from "./unlock-registry";
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
  keeperOff: new Set(),
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

describe("US-ONB-09 keeper switch (P-12): a third state beside operator switch and lock", () => {
  const off = (...ids: string[]) => input({ keeperOff: new Set(ids) });
  const keeperFunctions = UNLOCK_FUNCTIONS.filter((f) => f.keeperSwitch !== undefined);

  it.each(keeperFunctions.map((f) => [f.id, f.keeperSwitch] as const))(
    "US-ONB-09 %s is keeper_off while its switch is off, never locked and never announced",
    (id, sw) => {
      const s = of(id, off(sw as string));
      expect(s).toMatchObject({ state: "keeper_off", announced: false, mayUnlockNow: false });
      expect(s.reasons).toEqual([]);
      expect(s.ways).toEqual([]);
    },
  );

  it("US-ONB-09 an unlock never switches a feature on: a manual unlock, existing data or many do not beat the switch", () => {
    const over = {
      style: "many" as const,
      manualUnlocks: new Set(["wishlist"]),
      existingData: new Set(["wishlist"]),
      keeperOff: new Set(["wishlist"]),
    };
    expect(state("wishlist", input(over))).toBe("keeper_off");
  });

  it("US-ONB-09 switching the feature on again shows its state as before (locked with reason and way)", () => {
    expect(state("wishlist", off())).toBe("locked");
    expect(of("wishlist", off()).reasons.length).toBeGreaterThan(0);
  });

  it("US-ONB-09 the operator switch wins: a feature switched off by the operator is switched_off, not keeper_off", () => {
    expect(
      state("friends", input({ features: NO_FEATURES, keeperOff: new Set(["friends"]) })),
    ).toBe("switched_off");
  });

  it("US-ONB-09 friends and swapping share one keeper switch", () => {
    expect(state("friends", off("friends"))).toBe("keeper_off");
    expect(state("swapping", off("friends"))).toBe("keeper_off");
    expect(state("swapping", off("wishlist"))).toBe("locked");
  });

  it("US-WAC-07 the leaf log has a keeper switch of its own: off means keeper_off, on means open or locked by the first plant", () => {
    expect(state("leaf_log", off("leaf_log"))).toBe("keeper_off");
    expect(of("leaf_log", off("leaf_log"))).toMatchObject({ announced: false, reasons: [] });
    expect(state("leaf_log", input())).toBe("open");
    expect(state("leaf_log", input({ activeSpecimens: 0, firstSpecimenDate: null }))).toBe(
      "locked",
    );
  });

  it("US-ONB-09 the three achievement functions share the achievements switch", () => {
    for (const id of ["care_rhythm", "anniversaries", "year_in_review"])
      expect(state(id, off("achievement_views"))).toBe("keeper_off");
  });

  it("US-ONB-09 core functions have no keeper switch and stay open or locked whatever the switches say", () => {
    const everything = input({ keeperOff: new Set(KEEPER_SWITCH_IDS) });
    for (const id of CORE_FUNCTION_IDS) expect(state(id, everything)).toBe(state(id, input()));
  });

  it("US-ONB-09 the core functions are the nine of the owner's table (Heute, collection, catalog, zones, measuring, photos, growth, treatments, Pokedex)", () => {
    expect(CORE_FUNCTION_IDS).toEqual([
      "today",
      "collection",
      "species_catalog",
      "light_zones",
      "measuring",
      "photos",
      "growth",
      "treatments",
      "pokedex",
    ]);
  });

  it("US-ONB-09 the switchable features are derived from the registry: every keeper switch covers at least one function", () => {
    for (const sw of KEEPER_SWITCH_IDS) expect(keeperSwitchFunctions(sw).length).toBeGreaterThan(0);
    expect(KEEPER_SWITCH_IDS).toEqual([
      "wishlist",
      "discover",
      "equipment",
      "friends",
      "ai_access",
      "achievement_views",
      "leaf_log",
    ]);
    expect(UNLOCK_FUNCTIONS.length).toBe(CORE_FUNCTION_IDS.length + keeperFunctions.length);
  });
});
