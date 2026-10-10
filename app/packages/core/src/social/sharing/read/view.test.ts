import { beforeEach, describe, expect, it } from "vitest";
import { friendCollection, friendView, sharedSpeciesCount } from "../index";
import { InMemoryFacts, InMemoryPrivacy, InMemorySharing } from "../test-helpers";

const S1 = "s1";
const S2 = "s2";
const facts = {
  [S1]: {
    id: S1,
    speciesLatin: "Haworthia fasciata",
    speciesGerman: "Zebra-Haworthie",
    name: "Zebra",
    caughtAt: "2026-05-01",
    isCutting: false,
  },
  [S2]: {
    id: S2,
    speciesLatin: null,
    speciesGerman: null,
    name: "Steckling",
    caughtAt: null,
    isCutting: true,
  },
};

let sharing: InMemorySharing;
let privacy: InMemoryPrivacy;
const view = (viewer: string, owner: string) =>
  friendView({ sharing, privacy, facts: new InMemoryFacts(facts) }, viewer, owner);

beforeEach(() => {
  sharing = new InMemorySharing();
  privacy = new InMemoryPrivacy();
  sharing.friends.add("ben>anna");
});

describe("US-SOZ-04 what a friend sees", () => {
  it("US-SOZ-04 shows only the shared specimens with the whitelisted facts and unknown stays unknown (P-08)", async () => {
    await sharing.setMany("anna", [S1, S2], true, false);
    await sharing.setMany("anna", ["private-one"], false, false);
    const { specimens } = await view("ben", "anna");
    expect(specimens).toEqual([
      { ...facts[S1], repottedAt: null, photoShared: false },
      { ...facts[S2], repottedAt: null, photoShared: false },
    ]);
    // Nothing beyond the whitelist can be in an entry (location, markers, treatments, prices, notes).
    for (const s of specimens)
      expect(Object.keys(s).sort()).toEqual(
        [
          "caughtAt",
          "id",
          "isCutting",
          "name",
          "photoShared",
          "repottedAt",
          "speciesGerman",
          "speciesLatin",
        ].sort(),
      );
  });

  it("US-SOZ-04 the photo flag follows Share_Photos", async () => {
    await sharing.set("anna", S1, true, true);
    expect((await view("ben", "anna")).specimens[0]?.photoShared).toBe(true);
  });

  it("US-SOZ-04 someone who is not a friend sees nothing, like a friend who shares nothing (P-05)", async () => {
    await sharing.set("anna", S1, true, false);
    expect(await view("cleo", "anna")).toEqual({ specimens: [] });
    expect(await view("anna", "ben")).toEqual({ specimens: [] });
  });

  it("US-SOZ-04 ending the friendship withdraws everything at once without deleting the settings", async () => {
    await sharing.set("anna", S1, true, false);
    sharing.friends.delete("ben>anna");
    expect(await view("ben", "anna")).toEqual({ specimens: [] });
    sharing.friends.add("ben>anna");
    expect((await view("ben", "anna")).specimens).toHaveLength(1);
  });

  it("US-SOZ-04 'Everything private' suspends all sharing settings and keeps them", async () => {
    await sharing.set("anna", S1, true, false);
    privacy.on.add("anna");
    expect(await view("ben", "anna")).toEqual({ specimens: [] });
    expect(await sharing.list("anna")).toHaveLength(1);
    privacy.on.delete("anna");
    expect((await view("ben", "anna")).specimens).toHaveLength(1);
  });

  it("US-SOZ-04 a specimen without facts (archived, deleted) is left out", async () => {
    await sharing.setMany("anna", [S1, "gone"], true, false);
    expect((await view("ben", "anna")).specimens.map((s) => s.id)).toEqual([S1]);
  });
});

describe("US-SOZ-03 US-SOZ-04 shared caught species", () => {
  const count = (mine: string[], viewer = "ben") =>
    sharedSpeciesCount(
      {
        sharing,
        privacy,
        facts: new InMemoryFacts(facts),
        mine: { latinNamesOf: async () => mine },
      },
      viewer,
      "anna",
    );

  it("US-SOZ-03 counts only the species the friend shares and I have caught too", async () => {
    await sharing.setMany("anna", [S1, S2], true, false);
    expect(await count(["Haworthia fasciata", "Aloe vera"])).toBe(1);
    expect(await count(["Aloe vera"])).toBe(0);
  });

  it("US-SOZ-03 a friend who shares nothing is unknown, not 0 (P-08); so is a stranger", async () => {
    expect(await count(["Haworthia fasciata"])).toBeNull();
    await sharing.set("anna", S1, true, false);
    expect(await count(["Haworthia fasciata"], "cleo")).toBeNull();
    privacy.on.add("anna");
    expect(await count(["Haworthia fasciata"])).toBeNull();
  });
});

describe("US-SOZ-07 a friend's shared collection as cards", () => {
  const cards = (mine: string[], viewer = "ben") =>
    friendCollection(
      {
        sharing,
        privacy,
        facts: new InMemoryFacts(facts),
        mine: { latinNamesOf: async () => mine },
      },
      viewer,
      "anna",
    );

  it("US-SOZ-07 one card per shared species with count, first catch date and 'you have it' from my own collection", async () => {
    await sharing.setMany("anna", [S1, S2], true, false);
    const { cards: list } = await cards(["Haworthia fasciata"]);
    expect(list).toEqual([
      {
        speciesLatin: "Haworthia fasciata",
        speciesGerman: "Zebra-Haworthie",
        specimens: 1,
        cuttings: 0,
        firstCaught: "2026-05-01",
        iHave: true,
      },
      {
        speciesLatin: null,
        speciesGerman: null,
        specimens: 1,
        cuttings: 1,
        firstCaught: null,
        iHave: null,
      },
    ]);
    expect((await cards([])).cards[0]?.iHave).toBe(false);
  });

  it("US-SOZ-07 nothing private, nothing for strangers, nothing while 'Everything private' is on (P-05)", async () => {
    await sharing.set("anna", S1, true, false);
    expect((await cards([], "cleo")).cards).toEqual([]);
    privacy.on.add("anna");
    expect((await cards([])).cards).toEqual([]);
  });

  it("US-SOZ-07 cards carry facts only: no rank, no score, nothing of the friend's private data", async () => {
    await sharing.set("anna", S1, true, false);
    const [card] = (await cards([])).cards;
    expect(Object.keys(card ?? {}).sort()).toEqual(
      ["cuttings", "firstCaught", "iHave", "specimens", "speciesGerman", "speciesLatin"].sort(),
    );
  });
});
