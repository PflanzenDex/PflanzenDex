import { randomUUID } from "node:crypto";
import {
  createFileDatabase,
  migrate,
  openPool,
  ReviewPostgres,
  TaxonomyPostgres,
  withAccount,
} from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";

// US-POK-10, US-POK-11, FR-POK-13: `GET /pokedex/tree` gives the progress the species of the taxonomy tree with their
// families, genera, orders and German names. The tree is shared by all accounts and holds no user data; the German
// names come from the approved catalog and are read per request. The file runs in a database of its own.
const TZ = "Europe/Berlin";
const run = `pt${randomUUID()
  .replace(/[^a-f]/g, "")
  .padEnd(8, "x")
  .slice(0, 8)}`;
const genusA = `Treea${run}`;
const genusB = `Treeb${run}`;
const famA = `Treefamily${run}`;
const famB = `Treefamilyb${run}`;
const ordA = `Treeorder${run}`;
const provenance = {
  source: "opentree",
  url: "https://example.test/opentree",
  retrievedAt: "2026-10-06T10:00:00Z",
};
const taxon = (latinName: string, family: string | null, order: string | null) => ({
  latinName,
  lineage: {
    ottId: 1,
    acceptedName: latinName,
    genus: latinName.split(" ")[0] as string,
    family,
    order,
    provenance,
  },
  text: null,
  genusSpeciesCount: null,
  natureRarity: { iucn: null, occurrences: null },
});
const failure = (latinName: string) => ({ latinName, reason: "taxonomy.no_match" as const });
const buildOf = (
  fingerprint: string,
  builtAt: string,
  taxa: ReturnType<typeof taxon>[],
  failures: ReturnType<typeof failure>[] = [],
) => ({ fingerprint, builtAt, taxa, failures });

const alpha = `${genusA} alpha`;
const beta = `${genusA} beta`;
const gamma = `${genusB} gamma`;
const epsilon = `${genusB} epsilon`;
const delta = `${genusB} delta`;
const alphaId = randomUUID();
const betaId = randomUUID();
const gammaId = randomUUID();
const epsilonId = randomUUID();
const deltaId = randomUUID();
const operator = randomUUID();
const subA = `tree-a-${randomUUID()}`;
const subB = `tree-b-${randomUUID()}`;

let database: Awaited<ReturnType<typeof createFileDatabase>> | undefined;
let pool: Pool;
let admin: Pool;
const reviewer = async (token: string) =>
  token.startsWith("valid:")
    ? { sub: token.slice(6), email: "x@example.test", name: "T", email_verified: true }
    : null;
const newApp = (): Hono => createApp({ reviewer, pool });

/** One approved species with its German name, approved through the review path as the build tests do. */
async function approved(id: string, latinName: string, germanName: string) {
  await admin.query(
    "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')",
    [operator, id],
  );
  await admin.query(
    `insert into species (id, genus, epithet, latin_name, german_name, difficulty, standard_level, light_demand_lux,
       growth_measure, etiolation_signs, success_criteria, created_by)
     values ($1, $2, $3, $4, $5, 1, 2, 100, 'height', 'v', 'e', 'user')`,
    [id, latinName.split(" ")[0], latinName.split(" ")[1], latinName, germanName],
  );
  const cases = await withAccount(pool, operator, (c) =>
    c.query<{ id: string }>("select id from review_case where object_id = $1", [id]),
  );
  await new ReviewPostgres(pool).decide(operator, cases.rows[0]?.id ?? "", "reviewed", null);
}

async function plant(app: Hono, sub: string, speciesId: string) {
  const r = await app.request("/specimens", {
    method: "POST",
    headers: {
      authorization: `Bearer valid:${sub}`,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    body: JSON.stringify({ timeZone: TZ, speciesId, marker: "Baum" }),
  });
  expect(r.status).toBe(201);
}

/** The answer of `GET /pokedex/tree` as sent (text, so byte equality can be checked). */
async function treeText(app: Hono, sub: string | null = subA): Promise<string> {
  const r = await app.request("/pokedex/tree", {
    headers: sub === null ? {} : { authorization: `Bearer valid:${sub}` },
  });
  expect(r.status).toBe(200);
  return r.text();
}

interface TreeRowOut {
  latin: string;
  german: string | null;
  family: string | null;
  genus: string;
  order: string | null;
}
const speciesOf = async (app: Hono, sub = subA): Promise<TreeRowOut[] | null> =>
  (JSON.parse(await treeText(app, sub)) as { tree: { species: TreeRowOut[] } | null }).tree
    ?.species ?? null;

beforeAll(async () => {
  database = await createFileDatabase("pflanzendex_pok_tree");
  pool = openPool(database.ownerUrl);
  admin = openPool(database.fixtureUrl, true);
  await migrate(pool);
  await admin.query("insert into account (id) values ($1)", [operator]);
  await admin.query("insert into account_role (account, role) values ($1, 'operator')", [operator]);
  await approved(alphaId, alpha, "Alphakraut (Testpflanze)");
  await approved(betaId, beta, "Betakraut");
  await approved(gammaId, gamma, "Gammakraut");
  await approved(epsilonId, epsilon, "Epsilonkraut");
  await approved(deltaId, delta, "Deltakraut");
}, 60_000);

afterAll(async () => {
  if (!database) return;
  try {
    await pool.end();
    await admin.end();
  } finally {
    await database.drop();
  }
});

describe("US-POK-10 the tree the progress reads", () => {
  it("US-POK-10 before the first taxonomy build the tree is null, so the progress says it is not built (P-08)", async () => {
    expect(await treeText(newApp())).toBe(JSON.stringify({ tree: null }));
  });

  it("US-POK-10 · US-POK-11 without a sign-in the tree is refused with the error shape (P-04)", async () => {
    const r = await newApp().request("/pokedex/tree");
    expect(r.status).toBe(401);
    // The authentication answers with its own error body (`not_signed_in`), as every route under `/pokedex` does.
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("not_signed_in");
  });
});

describe("US-POK-11 the tree after a build", () => {
  it("US-POK-11 lists every resolved species with family, genus, order and the short German name, in Latin name order", async () => {
    const taxa = [
      taxon(gamma, famB, ordA),
      taxon(alpha, famA, ordA),
      taxon(beta, famA, ordA),
      taxon(epsilon, null, null),
    ];
    await new TaxonomyPostgres(pool).replace(
      buildOf("tree-fp-1", "2026-10-06T10:00:00Z", taxa, [failure(delta)]),
    );
    expect(await speciesOf(newApp())).toEqual([
      { latin: alpha, german: "Alphakraut", family: famA, genus: genusA, order: ordA },
      { latin: beta, german: "Betakraut", family: famA, genus: genusA, order: ordA },
      { latin: epsilon, german: "Epsilonkraut", family: null, genus: genusB, order: null },
      { latin: gamma, german: "Gammakraut", family: famB, genus: genusB, order: ordA },
    ]);
  });

  it("US-POK-11 a species that did not resolve is not in the tree", async () => {
    const species = await speciesOf(newApp());
    expect(species?.map((s) => s.latin)).not.toContain(delta);
  });

  it("US-POK-10 the tree holds no user data: a keeper's plant changes nothing and both keepers see the same answer", async () => {
    const app = newApp();
    const before = await treeText(app, subA);
    await plant(app, subA, alphaId);
    expect(await treeText(app, subA)).toBe(before);
    expect(await treeText(app, subB)).toBe(before);
  });

  it("US-POK-11 the German name is read per request: a corrected name shows without a new build", async () => {
    const app = newApp();
    await admin.query("update species set german_name = $2 where id = $1", [
      betaId,
      "Betakraut neu",
    ]);
    expect((await speciesOf(app))?.find((s) => s.latin === beta)?.german).toBe("Betakraut neu");
    await admin.query("update species set german_name = $2 where id = $1", [betaId, "Betakraut"]);
  });

  it("FR-POK-13 a new build shows at the next request, without a restart", async () => {
    await new TaxonomyPostgres(pool).replace(
      buildOf("tree-fp-2", "2026-10-07T10:00:00Z", [taxon(gamma, famB, null)]),
    );
    expect(await speciesOf(newApp())).toEqual([
      { latin: gamma, german: "Gammakraut", family: famB, genus: genusB, order: null },
    ]);
  });
});
