import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SpeciesPostgres } from "../catalog/index.ts";
import type { SpeciesRepointer } from "../catalog/index.ts";
import type { SpeciesName, SpeciesValues } from "../catalog/species.ts";
import { deleteAccountsWithCatalog } from "../fixtures.ts";
import { migrate, openPool, withAccount } from "../kernel/index.ts";
import { CareProfilePostgres, COLLECTION_REPOINTERS, SpecimenPostgres } from "./index.ts";

// Contract of the port `SpeciesRepointer` (ADR 0003, FR-QG-19, US-BES-10): every implementation, run in the
// transaction of the merge, moves the creator's references to the target species, reports what it moved and what it
// kept (P-10: nothing is dropped silently) and leaves everything as it was when the transaction rolls back.
// Real PostgreSQL (`make db-up`). Each implementation names how a reference of its kind is created and counted.
let pool: Pool;
const run = randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8);
let counter = 0;
const keeper = randomUUID();

const values = (name: string): SpeciesValues => ({
  latinName: name,
  genus: name.split(" ")[0] ?? name,
  epithet: null,
  cultivar: null,
  germanName: null,
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "height",
  etiolationSigns: "Triebe werden lang.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Kompakter Wuchs.",
  botanicalStory: null,
  source: "RHS",
});
async function proposal(label: string): Promise<string> {
  const w = values(`Vertragus ${label}${run}${++counter}`);
  const names: SpeciesName[] = [
    { field: "latin", display: w.latinName, norm: w.latinName.toLowerCase() },
  ];
  const r = await new SpeciesPostgres(pool).create(keeper, w, names);
  if (r.kind !== "fresh") throw new Error("duplicate");
  return r.value.id;
}

type Kind = {
  repointer: SpeciesRepointer;
  create: (speciesId: string) => Promise<void>;
  count: (speciesId: string) => Promise<number>;
};
const kinds = (): Kind[] => {
  const specimens = new SpecimenPostgres(pool);
  const profiles = new CareProfilePostgres(pool);
  const by = (kind: string) => {
    const found = COLLECTION_REPOINTERS.find((r) => r.kind === kind);
    if (!found) throw new Error(`no repointer ${kind}`);
    return found;
  };
  return [
    {
      repointer: by("specimen"),
      create: async (speciesId) => {
        const r = await specimens.create(keeper, {
          speciesId,
          name: `Vertrag ${++counter}`,
          marker: null,
          locationId: null,
          caughtAt: "2026-10-04",
        });
        if (typeof r === "string") throw new Error(r);
      },
      count: async (speciesId) =>
        (await specimens.list(keeper)).filter((s) => s.speciesId === speciesId).length,
    },
    {
      repointer: by("care_profile"),
      create: async (speciesId) => {
        await profiles.update(keeper, speciesId, { ownHints: "viel Licht" });
      },
      count: async (speciesId) =>
        (await profiles.list(keeper)).filter((p) => p.speciesId === speciesId).length,
    },
  ];
};

/** Runs `repoint` in a transaction of its own and commits or rolls back. */
async function inTransaction(
  kind: Kind,
  request: { from: string; to: string },
  end: "commit" | "rollback",
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await kind.repointer.repoint(client, {
      creatorId: keeper,
      fromSpeciesId: request.from,
      toSpeciesId: request.to,
    });
    await client.query(end);
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  await withAccount(pool, keeper, (c) => c.query("insert into account (id) values ($1)", [keeper]));
});
afterAll(async () => {
  await deleteAccountsWithCatalog(pool, [keeper]);
  await pool.end();
});

describe.each(["specimen", "care_profile"])("SpeciesRepointer contract · %s", (name) => {
  const kind = () => {
    const k = kinds().find((x) => x.repointer.kind === name);
    if (!k) throw new Error(name);
    return k;
  };

  it("names its kind of reference for the reviewer", () => {
    expect(kind().repointer.kind).toBe(name);
  });

  it("without references of the creator it moves nothing and keeps nothing", async () => {
    const [from, to] = [await proposal("A"), await proposal("B")];
    expect(await inTransaction(kind(), { from, to }, "commit")).toEqual({ moved: 0, kept: 0 });
  });

  it("moves the creator's reference to the target and accounts for every reference", async () => {
    const k = kind();
    const [from, to] = [await proposal("C"), await proposal("D")];
    await k.create(from);
    const r = await inTransaction(k, { from, to }, "commit");
    expect(r.moved + r.kept).toBe(1);
    expect(await k.count(to)).toBe(r.moved);
    expect(await k.count(from)).toBe(r.kept);
  });

  it("a rollback of the surrounding transaction leaves the reference where it was (atomic)", async () => {
    const k = kind();
    const [from, to] = [await proposal("E"), await proposal("F")];
    await k.create(from);
    await inTransaction(k, { from, to }, "rollback");
    expect(await k.count(from)).toBe(1);
    expect(await k.count(to)).toBe(0);
  });
});
