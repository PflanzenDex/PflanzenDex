import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { assignRole } from "../../fixtures.ts";
import {
  CatalogFillPostgres,
  CorrectionPostgres,
  ReviewPostgres,
  SpeciesPostgres,
} from "../index.ts";
import type { SpeciesValues } from "../species.ts";

// US-BES-16, DM-BES-06, DM-BES-07, FR-BES-12, FR-BES-19: corrections and version history (`make db-up`).
let owner: Pool;
let admin: Pool;
let store: CorrectionPostgres;
const [anna, bert, operator, reviewer] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const run = randomUUID().slice(0, 8);
let n = 0;

const values = (latinName: string): SpeciesValues => ({
  latinName,
  genus: latinName.split(" ")[0] ?? latinName,
  epithet: latinName.split(" ")[1] ?? null,
  cultivar: null,
  germanName: "Alt",
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  softLeaf: false,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "height",
  etiolationSigns: "Triebe werden lang und dünn.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Kompakter Wuchs.",
  botanicalStory: null,
  source: null,
});

/** An approved species with the german name "Alt" (approved by the operator like in the running app). */
async function approvedSpecies(approve = true): Promise<string> {
  const name = `Correctus c${run}${++n}`;
  const w = values(name);
  const r = await new SpeciesPostgres(owner).create(anna, w, [
    { field: "latin", display: name, norm: name.toLowerCase() },
  ]);
  if (r.kind !== "fresh") throw new Error("duplicate");
  if (approve) {
    const v = await withAccount(owner, operator, (c) =>
      c.query<{ id: string }>("select id from review_case where object_id = $1", [r.value.id]),
    );
    if (!(await new ReviewPostgres(owner).decide(operator, v.rows[0]?.id ?? "", "reviewed", null)))
      throw new Error("approval failed");
  }
  return r.value.id;
}
const propose = (user: string, species: string, value: string, source: string | null = null) =>
  store.create(user, {
    speciesId: species,
    field: "germanName",
    proposedValue: value,
    reason: "Buch",
    source,
  });
const germanName = async (id: string) =>
  (await admin.query("select german_name, version from species where id = $1", [id])).rows[0];

beforeAll(async () => {
  owner = openOwnerPool();
  admin = openFixturePool();
  await migrate(owner);
  store = new CorrectionPostgres(owner);
  for (const id of [anna, bert, operator, reviewer])
    await withAccount(owner, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await assignRole(owner, operator, "operator");
  await assignRole(owner, reviewer, "reviewer");
});

afterAll(async () => {
  await admin.query(
    "delete from species where id in (select object_id from review_case where account_id = any($1))",
    [[anna, operator]],
  );
  await admin.query("delete from account where id = any($1)", [[anna, bert, operator, reviewer]]);
  await Promise.all([owner.end(), admin.end()]);
});

describe("US-BES-16 a proposal is stored open and the catalog stays unchanged", () => {
  it("stores the old value from the catalog, not from the caller, and changes nothing in the species", async () => {
    const id = await approvedSpecies();
    const c = await propose(anna, id, "Neu", "Buch S. 4");
    expect(c).toMatchObject({
      status: "open",
      oldValue: "Alt",
      proposedValue: "Neu",
      source: "Buch S. 4",
    });
    expect(await germanName(id)).toMatchObject({ german_name: "Alt", version: 1 });
  });

  it("points a second proposer to the open correction (US-BES-14)", async () => {
    const id = await approvedSpecies();
    const first = await propose(anna, id, "Neu");
    const second = await propose(bert, id, "Neu");
    expect(second).toEqual({ duplicate: "id" in first ? first.id : "" });
  });

  it("a keeper cannot decide through plain SQL: status, content and species stay (P-03)", async () => {
    const id = await approvedSpecies();
    const c = await propose(anna, id, "Neu");
    const cid = "id" in c ? c.id : "";
    await expect(
      withAccount(owner, anna, (x) =>
        x.query("update catalog_correction set status = 'accepted' where id = $1", [cid]),
      ),
    ).rejects.toThrow();
    await expect(
      withAccount(owner, anna, (x) =>
        x.query("update species set german_name = 'Neu' where id = $1", [id]),
      ),
    ).rejects.toThrow();
    expect(await germanName(id)).toMatchObject({ german_name: "Alt" });
  });
});

describe("US-BES-16 tenant and rights (P-04, P-05)", () => {
  it("another keeper does not see the correction; the creator and reviewers do", async () => {
    const id = await approvedSpecies();
    await propose(anna, id, "Neu");
    expect((await store.listMine(bert)).filter((c) => c.speciesId === id)).toHaveLength(0);
    expect((await store.listMine(anna)).filter((c) => c.speciesId === id)).toHaveLength(1);
    expect((await store.listOpen(reviewer)).filter((c) => c.speciesId === id)).toHaveLength(1);
    await expect(store.listOpen(bert)).rejects.toThrow();
  });

  it("a keeper can neither accept, reject nor revert", async () => {
    const id = await approvedSpecies();
    const c = await propose(anna, id, "Neu");
    const cid = "id" in c ? c.id : "";
    await expect(store.accept(bert, cid)).rejects.toThrow();
    await expect(store.accept(anna, cid)).rejects.toThrow();
    await expect(store.reject(anna, cid, "x")).rejects.toThrow();
    await expect(store.revert(anna, id, "germanName", 1)).rejects.toThrow();
    expect(await germanName(id)).toMatchObject({ german_name: "Alt", version: 1 });
  });

  it("species that are not approved: not visible as a target and not acceptable", async () => {
    const id = await approvedSpecies(false);
    expect(await store.speciesValue(bert, id, "germanName")).toBeNull();
    expect(await store.speciesValue(anna, id, "germanName")).toBeNull();
  });
});

describe("US-BES-16 accept, reject, history and revert", () => {
  it("accepting sets the value, raises the version once and records community and the reviewer (FR-BES-12)", async () => {
    const id = await approvedSpecies();
    const c = await propose(anna, id, "Neu", "Buch S. 4");
    const cid = "id" in c ? c.id : "";
    expect(await store.accept(reviewer, cid)).toEqual({ version: 2 });
    expect(await germanName(id)).toMatchObject({ german_name: "Neu", version: 2 });
    const h = await store.history(bert, id, "germanName");
    expect(h).toEqual([
      expect.objectContaining({
        version: 2,
        value: "Neu",
        origin: "community",
        citation: "Buch S. 4",
        source: null,
        setBy: reviewer,
      }),
    ]);
    expect(await store.accept(reviewer, cid)).toBe("decided");
    expect(await store.accept(reviewer, randomUUID())).toBe("not_found");
    expect((await store.listMine(anna)).find((x) => x.id === cid)).toMatchObject({
      status: "accepted",
    });
  });

  it("rejecting stores the reason for the creator and leaves the catalog (US-BES-16)", async () => {
    const id = await approvedSpecies();
    const c = await propose(anna, id, "Neu");
    const cid = "id" in c ? c.id : "";
    expect(await store.reject(operator, cid, "Quelle passt nicht")).toBe("rejected");
    expect(await germanName(id)).toMatchObject({ german_name: "Alt", version: 1 });
    expect((await store.listMine(anna)).find((x) => x.id === cid)).toMatchObject({
      status: "rejected",
      decisionReason: "Quelle passt nicht",
    });
    expect(await store.reject(operator, cid, "nochmal")).toBe("decided");
    expect(await store.reject(operator, randomUUID(), "x")).toBe("not_found");
  });

  it("FR-BES-19: the fill job keeps the reviewed value; a correction replaces it only through a reviewer, history keeps the source", async () => {
    const id = await approvedSpecies();
    await admin.query("update species set family_latin = null where id = $1", [id]);
    // The job fills the empty family field (version 2, origin source) ...
    await new CatalogFillPostgres(owner).record(
      id,
      [],
      [
        {
          field: "familyLatin",
          value: "Asphodelaceae",
          origin: "source",
          source: "gbif",
          link: "https://example.org/gbif",
          license: "CC0-1.0",
          retrievedAt: "2026-10-18T10:00:00.000Z",
          disputed: false,
        },
      ],
    );
    // ... a later job run with another value does not overwrite it ...
    await new CatalogFillPostgres(owner).record(
      id,
      [],
      [
        {
          field: "familyLatin",
          value: "Andere",
          origin: "source",
          source: "gbif",
          link: "https://example.org/gbif",
          license: "CC0-1.0",
          retrievedAt: "2026-10-19T10:00:00.000Z",
          disputed: false,
        },
      ],
    );
    const c = await store.create(anna, {
      speciesId: id,
      field: "familyLatin",
      proposedValue: "Xanthorrhoeaceae",
      reason: "Neuere Systematik",
      source: "APG IV",
    });
    expect("id" in c).toBe(true);
    expect(await store.accept(reviewer, "id" in c ? c.id : "")).toEqual({ version: 3 });
    // ... and the reviewer reverts to the source value: it comes back as a new version with its source.
    expect(await store.revert(operator, id, "familyLatin", 2)).toEqual({ version: 4 });
    const h = (await store.history(anna, id, "familyLatin")) ?? [];
    expect(h.map((v) => [v.version, v.origin, v.value])).toEqual([
      [4, "reviewer", "Asphodelaceae"],
      [3, "community", "Xanthorrhoeaceae"],
      [2, "source", "Asphodelaceae"],
    ]);
    expect(h[0]?.source).toMatchObject({ name: "gbif", license: "CC0-1.0" });
    expect(await store.revert(operator, id, "familyLatin", 2)).toBe("unchanged");
    expect(await store.revert(operator, id, "familyLatin", 9)).toBe("not_found");
  });

  it("the history of an invisible species is null", async () => {
    const id = await approvedSpecies(false);
    expect(await store.history(bert, id, "germanName")).toBeNull();
  });
});
