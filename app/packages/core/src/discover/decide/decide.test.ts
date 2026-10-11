import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import type { TaxonCardRow } from "../../pokedex";
import { InMemoryWishes } from "../../wishlist/test-helpers";
import { discoverDecide } from "./index";

// 2026-10-02 23:30 UTC: already 3 October in Berlin, still 2 October in New York (NFR-08)
const NOW = new Date("2026-10-02T23:30:00Z");
const row = (latinName: string, family = "Moraceae"): TaxonCardRow => ({
  latinName,
  genus: latinName.split(" ")[0] ?? latinName,
  family,
  order: "Rosales",
  summary: null,
  summaryLanguage: null,
  imageUrl: "https://upload.example/x.jpg",
  pageUrl: "https://de.wikipedia.org/wiki/X",
  genusSpeciesCount: null,
});

let wishes: InMemoryWishes;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const decide = (input: Record<string, unknown>, userId: string | null = "anna") =>
  execute(
    discoverDecide({
      ownership: {
        specimens: { list: async () => [] },
        species: { find: async () => null, findMany: async () => [] },
      },
      tree: {
        tree: async () => [row("Aloe vera", "Asphodelaceae"), row("Ficus lyrata")],
        facts: async () => [],
      },
      wishes,
      stock: { stock: async () => [{ zoneId: "z2", name: "Lampe 2", count: 0 }] },
      clock: () => NOW,
    }),
    { idempotency: idem },
    {
      context: { userId },
      input: { species: "Aloe vera", decision: "yes", timeZone: "Europe/Berlin", ...input },
      idempotencyKey: `k${++counter}`,
    },
  );

beforeEach(() => {
  wishes = new InMemoryWishes({ anna: ["z2"] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-ENT-04 decision lands in the wishlist", () => {
  it("US-ENT-04 Yes creates an open Discover wish with the card data and the shown reasons", async () => {
    const r = await decide({});
    expect(r).toEqual({ ok: true, value: { decision: "yes", saved: true } });
    expect(wishes.rows).toHaveLength(1);
    expect(wishes.rows[0]).toMatchObject({
      name: "Aloe vera",
      status: "wishlist",
      type: "plant",
      source: "discover",
      decidedAt: "2026-10-03",
      imageUrl: "https://upload.example/x.jpg",
      imageSource: "https://de.wikipedia.org/wiki/X",
      license: null,
    });
    expect(wishes.rows[0]?.reasoning).toContain("Neue Familie: Asphodelaceae");
  });

  it("US-ENT-04 No creates the same wish as discarded", async () => {
    await decide({ decision: "no" });
    expect(wishes.rows[0]).toMatchObject({
      name: "Aloe vera",
      status: "discarded",
      source: "discover",
    });
  });

  it("US-ENT-04 Later writes nothing", async () => {
    const r = await decide({ decision: "later" });
    expect(r).toEqual({ ok: true, value: { decision: "later", saved: false } });
    expect(wishes.writes).toBe(0);
  });

  it("US-ENT-04 takes the date in the zone of the keeper (NFR-08)", async () => {
    await decide({ timeZone: "America/New_York" });
    expect(wishes.rows[0]?.decidedAt).toBe("2026-10-02");
  });

  it("US-ENT-04 is idempotent: a species that has a wish already gets no second one", async () => {
    await decide({});
    const again = await decide({ decision: "no" });
    expect(again).toEqual({ ok: true, value: { decision: "no", saved: false } });
    expect(wishes.rows).toHaveLength(1);
    expect(wishes.rows[0]?.status).toBe("wishlist");
  });

  it("US-ENT-04 refuses a species that is not suggested and writes nothing", async () => {
    const r = await decide({ species: "Unbekannt rara" });
    expect(!r.ok && r.error.code).toBe("discover.not_suggested");
    expect(wishes.writes).toBe(0);
  });

  it("US-ENT-04 refuses unknown decisions, a missing time zone and a signed-out call", async () => {
    expect((await decide({ decision: "maybe" })).ok).toBe(false);
    expect((await decide({ timeZone: "Mars/Olympus" })).ok).toBe(false);
    const out = await decide({}, null);
    expect(!out.ok && out.error.code).toBe("access.not_signed_in");
    expect(wishes.writes).toBe(0);
  });

  it("US-ENT-04 keeps the decision private to the account (P-04, FR-ENT-08)", async () => {
    await decide({});
    expect(wishes.rows.every((w) => (w as { userId: string }).userId === "anna")).toBe(true);
    expect(await wishes.open("ben")).toEqual([]);
  });
});
