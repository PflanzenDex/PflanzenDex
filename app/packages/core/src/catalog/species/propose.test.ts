import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { speciesHints, speciesLoad, speciesSearch, speciesPropose } from "./index";
import { InMemorySpecies } from "./test-helpers";

let store: InMemorySpecies;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const anna = { userId: "anna" };
const ben = { userId: "ben" };

const profile = {
  latinName: "Dracaena trifasciata",
  germanName: "Bogenhanf",
  synonyms: ["Sansevieria trifasciata"],
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  growthMeasure: "height",
  etiolationSigns: "Blätter werden schmal und kippen zur Seite.",
  successCriteria: "Neue Blätter wachsen aufrecht und kräftig gefärbt.",
};
const propose = (input: unknown, context: { userId: string | null } = anna) =>
  execute(
    speciesPropose(store),
    { idempotency: idem },
    { context, input, idempotencyKey: `k${++counter}` },
  );
const first = () => store.rows[0]?.id ?? "";

beforeEach(() => {
  store = new InMemorySpecies();
  idem = new InMemoryIdempotencyStore();
});

describe("US-BES-01 propose species (path without AI, FR-KI-05)", () => {
  it("creates a species with all required fields as a proposal, visible only to the creator (FR-BES-11)", async () => {
    const r = await propose(profile);
    expect(r.ok && r.value).toMatchObject({
      latinName: "Dracaena trifasciata",
      genus: "Dracaena",
      epithet: "trifasciata",
      synonyms: ["Sansevieria trifasciata"],
      reviewStatus: "proposal",
      createdBy: "user",
      own: true,
      dormancyFrom: null,
      wateringHint: null,
    });
    expect((await speciesSearch(store, "anna", "bogenhanf")).length).toBe(1);
    expect(await speciesSearch(store, "ben", "bogenhanf")).toEqual([]);
    expect(await speciesLoad(store, "ben", first())).toBeNull();
  });

  it.each([
    "latinName",
    "difficulty",
    "standardLevel",
    "lightDemandLux",
    "growthMeasure",
    "etiolationSigns",
    "successCriteria",
  ])("required field %s missing: rejected, nothing written (P-03, FR-BES-05)", async (field) => {
    const r = await propose({ ...profile, [field]: undefined });
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(!r.ok && r.error.details?.map((d) => d.field)).toEqual([field]);
    expect(store.rows).toHaveLength(0);
  });

  it("checks limits: difficulty 1 to 3, default level 2 to 4 (never level 1), lux integer", async () => {
    const deviations = [
      { difficulty: 4 },
      { standardLevel: 1 },
      { lightDemandLux: 1.5 },
      { growthMeasure: "weight" },
    ];
    for (const deviation of deviations) {
      const r = await propose({ ...profile, ...deviation });
      expect(!r.ok && r.error.code).toBe("input.invalid");
    }
    expect(store.rows).toHaveLength(0);
  });

  it("dormancy only as a month-day pair, may cross the new year; invalid is rejected", async () => {
    const good = await propose({ ...profile, dormancyFrom: "11-15", dormancyUntil: "02-28" });
    expect(good.ok && good.value).toMatchObject({ dormancyFrom: "11-15", dormancyUntil: "02-28" });
    const bad = [
      ["11-15", undefined],
      ["13-01", "02-01"],
      ["02-30", "03-01"],
    ];
    for (const [dormancyFrom, dormancyUntil] of bad) {
      const r = await propose({ ...profile, latinName: "Aloe vera", dormancyFrom, dormancyUntil });
      expect(!r.ok && r.error.code).toBe("input.invalid");
    }
  });

  it("unknown values stay unknown (null), nothing is invented (P-08)", async () => {
    const r = await propose(profile);
    expect(r.ok && r.value).toMatchObject({
      englishName: null,
      familyGerman: null,
      source: null,
      botanicalStory: null,
    });
  });

  it("a species without epithet (genus only) is allowed, but does not count as a Pokédex catch (US-POK-06)", async () => {
    const r = await propose({ ...profile, latinName: "Sansevieria", synonyms: [] });
    expect(r.ok && r.value).toMatchObject({ genus: "Sansevieria", epithet: null });
    expect(
      r.ok &&
        speciesHints(r.value)
          .map((h) => h.text)
          .join(" "),
    ).toContain("Gattung");
  });

  it("duplicate (same normalized name or synonym) is recognized and the existing species is referenced (FR-BES-03)", async () => {
    const first = await propose(profile);
    const same = await propose({ ...profile, latinName: "dracaena  Trifasciata" });
    expect(!same.ok && same.error.code).toBe("species.duplicate");
    expect(!same.ok && same.error.data).toMatchObject({
      existing: { id: first.ok && first.value.id },
    });
    const name = "Sansevieria trifasciata";
    const overSynonym = await propose({ ...profile, latinName: name, synonyms: [] });
    expect(!overSynonym.ok && overSynonym.error.code).toBe("species.duplicate");
    expect(store.rows).toHaveLength(1);
  });

  it("private proposals of others are not seen, so there is no duplicate either (P-04)", async () => {
    await propose(profile);
    expect((await propose(profile, ben)).ok).toBe(true);
  });

  it("the same repeat-guard key creates nothing twice (AB-3)", async () => {
    const call = { context: anna, input: profile, idempotencyKey: "same" };
    await execute(speciesPropose(store), { idempotency: idem }, call);
    const second = await execute(speciesPropose(store), { idempotency: idem }, call);
    expect(second.ok).toBe(true);
    expect(store.rows).toHaveLength(1);
  });

  it("no proposal without sign-in", async () => {
    const r = await propose(profile, { userId: null });
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
  });
});

describe("US-BES-01 search by Latin or German name and synonyms", () => {
  beforeEach(async () => {
    await propose(profile);
    store.approve(first());
  });

  it("finds the species via Latin name, German name and synonym and says which (Sansevieria -> Dracaena)", async () => {
    const latin = await speciesSearch(store, "ben", "DRACAENA triFasciata");
    const german = await speciesSearch(store, "ben", "Bogenhanf");
    const synonym = await speciesSearch(store, "ben", "Sansevieria");
    expect(latin[0]?.hit).toMatchObject({ field: "latin" });
    expect(german[0]?.hit).toMatchObject({ field: "german" });
    expect(synonym[0]).toMatchObject({
      latinName: "Dracaena trifasciata",
      hit: { field: "synonym", display: "Sansevieria trifasciata" },
    });
  });

  it("shows the profile with the fields from DM-BES-01; approved ones everybody sees", async () => {
    const species = await speciesLoad(store, "ben", first());
    expect(species).toMatchObject({
      difficulty: 1,
      standardLevel: 2,
      lightDemandLux: 15000,
      own: false,
    });
  });

  it("without hits: empty list; empty search lists all visible", async () => {
    expect(await speciesSearch(store, "ben", "Zzyzx")).toEqual([]);
    expect(await speciesSearch(store, "ben", "  ")).toHaveLength(1);
  });
});

describe("hints on a species (P-09, FR-BES-11)", () => {
  it("a proposal names the next action: have the species reviewed, then it counts", async () => {
    const r = await propose(profile);
    expect(r.ok && speciesHints(r.value)[0]).toMatchObject({
      text: expect.stringContaining("nur für dich sichtbar"),
      nextAction: expect.stringContaining("prüfen lassen"),
    });
  });
});

describe("US-BES-01 further edge cases", () => {
  it.each([[["a"]], ["kein Array"], [Array.from({ length: 21 }, (_, i) => `Name ${i}x`)], [[5]]])(
    "invalid synonyms %j are rejected",
    async (synonyms) => {
      const r = await propose({ ...profile, synonyms });
      expect(!r.ok && r.error.details?.map((d) => d.field)).toEqual(["synonyms"]);
    },
  );

  it("empty synonyms and duplicate names count once", async () => {
    const r = await propose({
      ...profile,
      synonyms: ["Dracaena  trifasciata", "Dracaena trifasciata"],
    });
    expect(r.ok && r.value.synonyms).toHaveLength(2);
  });

  it("an invalid id is not a species, not a server error", async () => {
    expect(await speciesLoad(store, "anna", "no-uuid")).toBeNull();
  });

  it("hints: rejected names the next action, approved with epithet has none", async () => {
    const r = await propose(profile);
    if (!r.ok) throw new Error("Proposal failed");
    expect(speciesHints({ ...r.value, reviewStatus: "rejected" })[0]?.nextAction).toContain(
      "erneut",
    );
    expect(speciesHints({ ...r.value, reviewStatus: "ai_unreviewed" })).toHaveLength(1);
    expect(speciesHints({ ...r.value, reviewStatus: "reviewed", own: false })).toEqual([]);
  });

  it("US-BES-10 the creator learns the result as a hint: reason of a rejection, approval", async () => {
    const r = await propose(profile);
    if (!r.ok) throw new Error("Proposal failed");
    const rejected = speciesHints({
      ...r.value,
      reviewStatus: "rejected",
      reviewReason: "Quelle fehlt",
    });
    expect(rejected[0]?.text).toContain("Quelle fehlt");
    const approved = speciesHints({ ...r.value, reviewStatus: "reviewed" });
    expect(approved.map((h) => h.text).join(" ")).toContain("freigegeben");
  });

  it("US-BES-10 the rejection hint has no doubled period when the reason ends with one", async () => {
    const r = await propose(profile);
    if (!r.ok) throw new Error("Proposal failed");
    const [hint] = speciesHints({
      ...r.value,
      reviewStatus: "rejected",
      reviewReason: "Die Quelle belegt den Lichtbedarf nicht.",
    });
    expect(hint?.text).toBe(
      "Die Prüfung hat dieses Profil nicht freigegeben: Die Quelle belegt den Lichtbedarf nicht. Es bleibt nur für dich sichtbar.",
    );
  });

  it("US-BES-10 the rejection hint cuts trailing punctuation and whitespace in linear time, whatever the reason holds", async () => {
    const r = await propose(profile);
    if (!r.ok) throw new Error("Proposal failed");
    const text = (reviewReason: string) =>
      speciesHints({ ...r.value, reviewStatus: "rejected", reviewReason })[0]?.text;
    const cut = (reason: string) =>
      `Die Prüfung hat dieses Profil nicht freigegeben: ${reason}. Es bleibt nur für dich sichtbar.`;
    expect(text("Quelle fehlt")).toBe(cut("Quelle fehlt"));
    expect(text("Quelle fehlt!?. \t\n")).toBe(cut("Quelle fehlt"));
    expect(text("Zeile 1.\nZeile 2...")).toBe(cut("Zeile 1.\nZeile 2"));
    const started = Date.now();
    for (const filler of ["\t", " ", ".", "\t.", "a\t"]) {
      const adversarial = `Grund${filler.repeat(200_000)}x`;
      expect(text(adversarial)).toBe(cut(adversarial));
      expect(text(`Grund${filler.repeat(200_000)}`)).toBe(
        cut(filler === "a\t" ? `Grund${"a\t".repeat(199_999)}a` : "Grund"),
      );
    }
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

const proposeEntry = (input: Record<string, unknown>) => propose({ ...profile, ...input });

describe("US-POK-02 catalog entry: names are normalized, rating limits warn per field", () => {
  it("normalizes `ficus BENJAMINA` to `Ficus benjamina`", async () => {
    const r = await proposeEntry({ latinName: "ficus BENJAMINA" });
    expect(r.ok && r.value.latinName).toBe("Ficus benjamina");
  });

  it("drops a duplicate: the second entry with the same normalized name creates nothing", async () => {
    await proposeEntry({ latinName: "Ficus benjamina" });
    const r = await proposeEntry({ latinName: "ficus BENJAMINA" });
    expect(!r.ok && r.error.code).toBe("species.duplicate");
    expect(store.rows).toHaveLength(1);
  });

  it("names the invalid rating on its field (difficulty outside 1-3, light level outside 2-4)", async () => {
    const r = await proposeEntry({ difficulty: 4, standardLevel: 1 });
    expect(!r.ok && r.error.details?.map((d) => d.field).sort()).toEqual([
      "difficulty",
      "standardLevel",
    ]);
  });
});

describe("US-POK-02 hybrid signs and additions do not belong in the catalog (US-POK-06)", () => {
  it.each(["Citrus x limon", "Citrus × limon", "×Fatshedera lizei", "Citrus X limon"])(
    "refuses the hybrid sign in %j with its own code on latinName",
    async (latinName) => {
      const r = await proposeEntry({ latinName });
      expect(!r.ok && r.error.details).toEqual([
        { field: "latinName", code: "catalog.name_hybrid" },
      ]);
      expect(store.rows).toHaveLength(0);
    },
  );

  it.each([
    "Aloe vera var. chinensis",
    "Aloe vera subsp. x",
    "Aloe vera f. alba",
    "Aloe vera cv. Foo",
  ])("refuses the addition in %j with its own code on latinName", async (latinName) => {
    const r = await proposeEntry({ latinName });
    expect(!r.ok && r.error.details).toEqual([
      { field: "latinName", code: "catalog.name_addition" },
    ]);
  });

  it("keeps plain invalid names on the generic code", async () => {
    const r = await proposeEntry({ latinName: "123" });
    expect(!r.ok && r.error.details).toEqual([{ field: "latinName", code: "input.invalid" }]);
  });

  it("does not mistake a species epithet starting with x for a hybrid sign", async () => {
    const r = await proposeEntry({ latinName: "Aloe xanthacantha" });
    expect(r.ok).toBe(true);
  });
});
