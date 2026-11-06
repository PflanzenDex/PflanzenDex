import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import type { TaxonCardRow } from "../../pokedex";
import {
  wishNameKey,
  type DecisionStore,
  type DiscoverDecision,
  type WishRow,
  type WishStatus,
} from "../../wishlist";
import { bare, InMemoryWishes } from "../../wishlist/test-helpers";
import { discoverDecide, discoverUndo } from "./index";

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
  natureRarity: { iucn: null, occurrences: null },
});

/**
 * The decisions over the in-memory wishes (tests only; the adapter is `DecisionsPostgres` in `db`). The mark is the newest
 * wish that carries a Yes or No; a take-back clears every mark, as the database does with the wish that carried it.
 */
class InMemoryDecisions implements DecisionStore {
  constructor(private readonly wishes: InMemoryWishes) {}

  private marked(userId: string) {
    return this.wishes.rows.filter((r) => r.userId === userId && r.lastDecision).at(-1);
  }

  async decisionOf(userId: string, nameKey: string): Promise<DiscoverDecision | null> {
    const row = this.wishes.rows.find(
      (r) => r.userId === userId && (r.nameKey ?? wishNameKey(r.name)) === nameKey,
    );
    if (!row) return null;
    const last = this.marked(userId) === row;
    return {
      wish: bare(row),
      source: row.source === "discover" ? "discover" : "manual",
      decision: last ? (row.lastDecision ?? null) : null,
    };
  }

  async takeBackDecision(
    userId: string,
    take: { wishId: string; decision: "yes" | "no"; status: WishStatus },
  ): Promise<WishRow | "not_found" | "not_last" | "changed"> {
    const i = this.wishes.rows.findIndex((r) => r.userId === userId && r.id === take.wishId);
    const row = this.wishes.rows[i];
    if (!row) return "not_found";
    if (this.marked(userId) !== row) return "not_last";
    if (row.lastDecision !== take.decision || row.status !== take.status || row.specimenId !== null)
      return "changed";
    this.wishes.writes += 1;
    this.wishes.rows.splice(i, 1);
    for (const r of this.wishes.rows) if (r.userId === userId) r.lastDecision = null;
    return bare(row);
  }
}

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
        appRarity: async () => ({ participants: 0, owners: new Map() }),
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

/** `discover.undo`: takes back the last Yes or No for the species (US-ENT-04). */
const takeBack = (input: Record<string, unknown>, userId: string | null = "anna", key?: string) =>
  execute(
    discoverUndo({ decisions: new InMemoryDecisions(wishes) }),
    { idempotency: idem },
    {
      context: { userId },
      input: { species: "Aloe vera", ...input },
      idempotencyKey: key ?? `k${++counter}`,
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

describe("US-ENT-04 undo takes the last decision back", () => {
  it("US-ENT-04 undo of the last Yes removes the wish that decision created and answers undone", async () => {
    await decide({});
    expect(await takeBack({})).toEqual({ ok: true, value: { undone: true } });
    expect(wishes.rows).toEqual([]);
  });

  it("US-ENT-04 undo of the last No removes the discarded wish", async () => {
    await decide({ decision: "no" });
    expect(await takeBack({})).toEqual({ ok: true, value: { undone: true } });
    expect(wishes.rows).toEqual([]);
  });

  it("US-ENT-04 only the last Yes or No can be taken back: an earlier one is refused and nothing is removed", async () => {
    await decide({});
    await decide({ species: "Ficus lyrata", decision: "no" });
    const r = await takeBack({});
    expect(!r.ok && r.error.code).toBe("discover.undo_not_last");
    expect(wishes.rows.map((w) => w.name).sort()).toEqual(["Aloe vera", "Ficus lyrata"]);
  });

  it("US-ENT-04 a repeated undo with a new key writes nothing and answers undone false", async () => {
    await decide({});
    await takeBack({});
    const writes = wishes.writes;
    expect(await takeBack({})).toEqual({ ok: true, value: { undone: false } });
    expect(wishes.writes).toBe(writes);
  });

  it("US-ENT-04 the same Idempotency-Key does not undo twice, even when the species was decided again", async () => {
    await decide({});
    expect((await takeBack({}, "anna", "same")).ok).toBe(true);
    await decide({});
    expect(await takeBack({}, "anna", "same")).toEqual({ ok: true, value: { undone: true } });
    expect(wishes.rows).toHaveLength(1);
  });

  it("US-ENT-04 a Later and a repeated decision write nothing and leave the undo open", async () => {
    await decide({});
    await decide({ decision: "later" });
    await decide({ decision: "no" });
    expect(await takeBack({})).toEqual({ ok: true, value: { undone: true } });
  });

  it("US-ENT-04 a wish bought since the Yes stays and the undo is refused with discover.undo_changed", async () => {
    await decide({});
    await wishes.buy("anna", "w1");
    const r = await takeBack({});
    expect(!r.ok && r.error.code).toBe("discover.undo_changed");
    expect(wishes.rows[0]?.status).toBe("bought");
  });

  it("US-ENT-04 a wish discarded since the Yes stays and the undo is refused with discover.undo_changed", async () => {
    await decide({});
    await wishes.discard("anna", "w1");
    const r = await takeBack({});
    expect(!r.ok && r.error.code).toBe("discover.undo_changed");
    expect(wishes.rows[0]?.status).toBe("discarded");
  });

  it("US-ENT-04 a manual wish of the same species is no Discover decision: refused with discover.not_a_decision and kept", async () => {
    wishes.seed("anna", { id: "m1", name: "Aloe vera" });
    const r = await takeBack({});
    expect(!r.ok && r.error.code).toBe("discover.not_a_decision");
    expect(wishes.rows.map((w) => w.id)).toEqual(["m1"]);
  });

  it("US-ENT-04 the undo touches no other wish: a manual wish stays next to the taken-back one", async () => {
    wishes.seed("anna", { id: "m1", name: "Ficus lyrata" });
    await decide({});
    await takeBack({});
    expect(wishes.rows.map((w) => w.id)).toEqual(["m1"]);
  });

  it("US-ENT-04 another account cannot take back my decision: it answers undone false and my wish stays (P-04)", async () => {
    await decide({});
    expect(await takeBack({}, "ben")).toEqual({ ok: true, value: { undone: false } });
    expect(wishes.rows).toHaveLength(1);
  });

  it("US-ENT-04 refuses an empty species and a signed-out call; nothing is written", async () => {
    await decide({});
    const writes = wishes.writes;
    const empty = await takeBack({ species: "" });
    expect(!empty.ok && empty.error.code).toBe("input.invalid");
    const out = await takeBack({}, null);
    expect(!out.ok && out.error.code).toBe("access.not_signed_in");
    expect(wishes.writes).toBe(writes);
  });
});
