import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, withAccount, openPool } from "../kernel/index.ts";
import { assignRole, deleteAccountsWithCatalog, reviewCaseIdOf } from "../fixtures.ts";
import { ReviewPostgres, SpeciesPostgres } from "../catalog/index.ts";
import type { SpeciesName, SpeciesValues } from "../catalog/species.ts";
import { CareProfilePostgres, COLLECTION_REPOINTERS, SpecimenPostgres } from "./index.ts";

// US-BES-10, FR-BES-11, P-04, P-10: the merge of a proposal re-points the creator's references atomically
// (real PostgreSQL). The catalog adapter is composed with the ports of `collection`, as the API does.
let pool: Pool;
let species: SpeciesPostgres;
let reviews: ReviewPostgres;
let specimens: SpecimenPostgres;
let profiles: CareProfilePostgres;
const [keeper, other, operator, reviewer] = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
];
const run = randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8);
let counter = 0;

const values = (name: string): SpeciesValues => ({
  latinName: name,
  genus: name.split(" ")[0] ?? name,
  epithet: name.split(" ")[1] ?? null,
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
const names = (w: SpeciesValues): SpeciesName[] => [
  { field: "latin", display: w.latinName, norm: w.latinName.toLowerCase() },
];

/** A species proposed by `user`; returns species and review case id. */
async function propose(user: string, label: string) {
  const w = { ...values(`Mergeus ${label.trim()}${run}${++counter}`), epithet: null };
  const r = await species.create(user, w, names(w));
  if (r.kind !== "fresh") throw new Error("duplicate");
  return {
    speciesId: r.value.id,
    caseId: await reviewCaseIdOf(pool, r.value.id),
    latinName: w.latinName,
  };
}
const approved = async (label: string) => {
  const p = await propose(operator, label);
  await reviews.decide(operator, p.caseId, "reviewed", null);
  return p;
};
const specimen = async (
  user: string,
  speciesId: string,
  name: string,
  marker: string | null = null,
) => {
  const r = await specimens.create(user, {
    speciesId,
    name,
    marker,
    locationId: null,
    caughtAt: "2026-10-04",
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};
const speciesOf = async (user: string) =>
  (await specimens.list(user)).map((s) => `${s.name}:${s.speciesId}`).sort();

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  species = new SpeciesPostgres(pool);
  reviews = new ReviewPostgres(pool, COLLECTION_REPOINTERS);
  specimens = new SpecimenPostgres(pool);
  profiles = new CareProfilePostgres(pool);
  for (const id of [keeper, other, operator, reviewer])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await assignRole(pool, operator, "operator");
  await assignRole(pool, reviewer, "reviewer");
});
afterAll(async () => {
  const accounts = [keeper, other, operator, reviewer];
  await deleteAccountsWithCatalog(pool, accounts);
  await pool.end();
});

describe("US-BES-10 merge re-points the creator's references (FR-BES-11, P-10)", () => {
  it("US-BES-10 specimens and the care profile follow the proposal to the existing species; nothing is lost", async () => {
    const target = await approved("Target ");
    const p = await propose(keeper, "Proposal ");
    await specimen(keeper, p.speciesId, "Erste");
    await specimen(keeper, p.speciesId, "Zweite", "rot");
    await profiles.update(keeper, p.speciesId, { ownHints: "viel Licht" });

    const r = await reviews.merge(reviewer, p.caseId, target.speciesId);
    if (r === null || r === "conflict" || r === "lock_failed") throw new Error(String(r));
    expect(r.reviewCase).toMatchObject({
      status: "merged",
      mergedInto: target.speciesId,
      reviewedBy: reviewer,
      creatorId: keeper,
    });
    expect(r.moved).toEqual([
      { kind: "specimen", moved: 2, kept: 0 },
      { kind: "care_profile", moved: 1, kept: 0 },
    ]);
    expect(await speciesOf(keeper)).toEqual(
      [`Erste:${target.speciesId}`, `Zweite:${target.speciesId}`].sort(),
    );
    expect((await profiles.list(keeper)).map((x) => [x.speciesId, x.ownHints])).toEqual([
      [target.speciesId, "viel Licht"],
    ]);
    // The merged proposal is gone for its creator and for reviewers; the target is visible to all.
    expect(await species.find(keeper, p.speciesId)).toBeNull();
    expect(await species.findForReview(reviewer, p.speciesId)).toBeNull();
    expect(await species.find(keeper, target.speciesId)).toMatchObject({
      reviewStatus: "reviewed",
    });
    expect(await reviews.find(keeper, p.caseId)).toMatchObject({ status: "merged" });
  });

  it("US-BES-10 an existing care profile of the creator for the target stays; the other is kept and reported", async () => {
    const target = await approved("Profile ");
    const p = await propose(keeper, "Prof proposal ");
    await profiles.update(keeper, target.speciesId, { ownHints: "bleibt" });
    await profiles.update(keeper, p.speciesId, { ownHints: "bleibt nicht auf Ziel" });
    const r = await reviews.merge(operator, p.caseId, target.speciesId);
    if (r === null || r === "conflict" || r === "lock_failed") throw new Error(String(r));
    expect(r.moved.find((m) => m.kind === "care_profile")).toEqual({
      kind: "care_profile",
      moved: 0,
      kept: 1,
    });
    const own = await profiles.list(keeper);
    expect(own.find((x) => x.speciesId === target.speciesId)?.ownHints).toBe("bleibt");
    expect(own.find((x) => x.speciesId === p.speciesId)?.ownHints).toBe("bleibt nicht auf Ziel");
  });

  it("US-BES-10 the same marker on the target is a conflict: nothing is merged, nothing moved (atomic)", async () => {
    const target = await approved("Conflict ");
    const p = await propose(keeper, "Conf proposal ");
    await specimen(keeper, target.speciesId, "Alt", "rot");
    await specimen(keeper, p.speciesId, "Neu", "rot");
    await specimen(keeper, p.speciesId, "Mit-Marker-Gelb", "gelb");
    const before = await speciesOf(keeper);
    expect(await reviews.merge(reviewer, p.caseId, target.speciesId)).toBe("conflict");
    expect(await speciesOf(keeper)).toEqual(before);
    expect(await reviews.find(reviewer, p.caseId)).toMatchObject({
      status: "proposal",
      mergedInto: null,
    });
  });

  it("US-BES-10 P-04 foreign accounts' references are not touched", async () => {
    const target = await approved("Foreign ");
    const p = await propose(keeper, "Foreign proposal ");
    await specimen(keeper, p.speciesId, "Meins");
    await specimen(other, target.speciesId, "Fremd");
    const before = await speciesOf(other);
    await reviews.merge(reviewer, p.caseId, target.speciesId);
    expect(await speciesOf(other)).toEqual(before);
  });

  it("US-BES-10 a plant keeper cannot merge (database refuses); everything is rolled back", async () => {
    const target = await approved("Denied ");
    const p = await propose(keeper, "Denied proposal ");
    await specimen(keeper, p.speciesId, "Bleibt");
    const before = await speciesOf(keeper);
    await expect(reviews.merge(keeper, p.caseId, target.speciesId)).rejects.toThrow();
    await expect(reviews.merge(other, p.caseId, target.speciesId)).resolves.toBeNull();
    expect(await speciesOf(keeper)).toEqual(before);
    expect(await reviews.find(keeper, p.caseId)).toMatchObject({ status: "proposal" });
  });

  it("US-BES-10 the database refuses a target that is not an approved species; rolled back", async () => {
    const notApproved = await propose(other, "Unapproved ");
    const p = await propose(keeper, "Unappr proposal ");
    await specimen(keeper, p.speciesId, "Bleibt2");
    const before = await speciesOf(keeper);
    await expect(reviews.merge(reviewer, p.caseId, notApproved.speciesId)).rejects.toThrow(
      /approved species/,
    );
    await expect(reviews.merge(reviewer, p.caseId, p.speciesId)).rejects.toThrow();
    expect(await speciesOf(keeper)).toEqual(before);
  });

  it("US-BES-10 a decided case can neither be merged nor decided again", async () => {
    const target = await approved("Decided ");
    const p = await propose(keeper, "Decided proposal ");
    await reviews.decide(reviewer, p.caseId, "rejected", "Quelle fehlt");
    expect(await reviews.merge(reviewer, p.caseId, target.speciesId)).toBeNull();
    const q = await propose(keeper, "Decided2 proposal ");
    await reviews.merge(reviewer, q.caseId, target.speciesId);
    await expect(reviews.decide(reviewer, q.caseId, "reviewed", null)).rejects.toThrow(
      /already decided/,
    );
  });
});

describe("US-BES-10 review list and content visibility (FR-BES-11, P-04)", () => {
  it("US-BES-10 reviewers read open proposals and their content; keepers see only their own", async () => {
    const p = await propose(keeper, "Visible ");
    const list = await reviews.listForReview(reviewer);
    expect(list.map((z) => z.id)).toContain(p.caseId);
    expect(list.every((z) => ["proposal", "ai_unreviewed", "curated"].includes(z.status))).toBe(
      true,
    );
    expect(await species.findForReview(reviewer, p.speciesId)).toMatchObject({
      id: p.speciesId,
      reviewStatus: "proposal",
      own: false,
    });
    // Plant keepers: foreign content stays invisible, also via the review path.
    expect(await species.findForReview(other, p.speciesId)).toBeNull();
    expect(await species.find(other, p.speciesId)).toBeNull();
    expect(await species.find(reviewer, p.speciesId)).toBeNull();
    expect((await species.search(other, null)).map((s) => s.id)).not.toContain(p.speciesId);
    expect((await species.search(reviewer, null)).map((s) => s.id)).not.toContain(p.speciesId);
    expect((await reviews.listForReview(other)).every((z) => z.creatorId === other)).toBe(true);
  });

  it("US-BES-10 the creator sees the rejection reason; others do not", async () => {
    const p = await propose(keeper, "Rejected ");
    await reviews.decide(reviewer, p.caseId, "rejected", "Quelle für Lichtbedarf fehlt");
    expect(await species.find(keeper, p.speciesId)).toMatchObject({
      reviewStatus: "rejected",
      reviewReason: "Quelle für Lichtbedarf fehlt",
    });
    expect(await species.find(other, p.speciesId)).toBeNull();
  });

  it("US-BES-10 a duplicate check never reveals a foreign proposal (reviewers included)", async () => {
    const p = await propose(keeper, "Dup ");
    const w = { ...values(p.latinName), epithet: null };
    for (const user of [reviewer, other]) {
      const again = await species.create(user, w, names(w));
      expect(again.kind).toBe("fresh");
    }
  });

  it("US-BES-10 operator batches are listed with status curated", async () => {
    const batch = await reviews.create(operator, {
      objectKind: "species",
      objectId: randomUUID(),
      status: "curated",
    });
    const id = typeof batch === "string" ? "" : batch.id;
    const list = await reviews.listForReview(reviewer);
    expect(list.find((z) => z.id === id)).toMatchObject({
      status: "curated",
      objectKind: "species",
    });
  });
});

describe("US-BES-10 a merge and a concurrent write on the proposal (FR-BES-11, P-10)", () => {
  it("US-BES-10 a specimen created while the merge runs is re-pointed too, never left on the hidden species", async () => {
    const target = await approved("Race target ");
    const p = await propose(keeper, "Race proposal ");
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let inserted: () => void = () => undefined;
    const insertedSignal = new Promise<void>((resolve) => (inserted = resolve));
    // The keeper's write is in flight: inserted, not yet committed (it holds a key lock on the species row).
    const inFlight = withAccount(pool, keeper, async (c) => {
      await c.query(
        `insert into specimen (account_id, species_id, name, caught_at, status)
         values ($1, $2, 'Unterwegs', '2026-10-04', 'plant')`,
        [keeper, p.speciesId],
      );
      inserted();
      await gate;
    });
    await insertedSignal;
    let done = false;
    const merging = reviews.merge(reviewer, p.caseId, target.speciesId).then((r) => {
      done = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(done).toBe(false); // the merge waits for the write in flight
    release();
    await inFlight;
    const r = await merging;
    if (r === null || r === "conflict" || r === "lock_failed") throw new Error(String(r));
    expect(r.moved[0]).toEqual({ kind: "specimen", moved: 1, kept: 0 });
    expect(await speciesOf(keeper)).toContain(`Unterwegs:${target.speciesId}`);
  });

  it("US-BES-10 creating a specimen or a profile on an already merged proposal is refused", async () => {
    const target = await approved("Late target ");
    const p = await propose(keeper, "Late proposal ");
    await reviews.merge(operator, p.caseId, target.speciesId);
    expect(
      await specimens.create(keeper, {
        speciesId: p.speciesId,
        name: "Zu spät",
        marker: null,
        locationId: null,
        caughtAt: "2026-10-04",
      }),
    ).toBe("species_unknown");
    expect(await profiles.update(keeper, p.speciesId, { ownHints: "zu spät" })).toBe(
      "species_unknown",
    );
    expect((await speciesOf(keeper)).some((x) => x.startsWith("Zu spät"))).toBe(false);
  });

  it("US-BES-10 the merged proposal's own species can be found for its creator, for nobody else", async () => {
    const target = await approved("Found target ");
    const p = await propose(keeper, "Found proposal ");
    await reviews.merge(operator, p.caseId, target.speciesId);
    expect(await species.mergedInto(keeper, p.speciesId)).toEqual({
      id: target.speciesId,
      latinName: target.latinName,
    });
    expect(await species.mergedInto(other, p.speciesId)).toBeNull();
    expect(await species.mergedInto(keeper, target.speciesId)).toBeNull();
  });

  it("US-BES-10 reviewers cannot read foreign rejected proposals, only open ones", async () => {
    const open = await propose(keeper, "Open ");
    const rejected = await propose(keeper, "Rejected foreign ");
    await reviews.decide(operator, rejected.caseId, "rejected", "Quelle fehlt");
    expect(await species.findForReview(reviewer, open.speciesId)).not.toBeNull();
    expect(await species.findForReview(reviewer, rejected.speciesId)).toBeNull();
    expect(await species.find(reviewer, rejected.speciesId)).toBeNull();
    expect((await species.search(reviewer, null)).map((s) => s.id)).not.toContain(
      rejected.speciesId,
    );
    // The name rows are hidden too: searching the exact name finds nothing for a reviewer.
    const byName = await species.search(reviewer, rejected.latinName.toLowerCase());
    expect(byName.map((x) => x.id)).not.toContain(rejected.speciesId);
    // The creator still reads their rejected proposal.
    expect(await species.find(keeper, rejected.speciesId)).toMatchObject({
      reviewStatus: "rejected",
    });
  });
});
