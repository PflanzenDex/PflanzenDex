import { randomUUID } from "node:crypto";
import { pokedexOwnership, readAppRarityBasis, readCollectorCards } from "@pflanzendex/core";
import {
  ActiveSpeciesPostgres,
  createFileDatabase,
  migrate,
  openPool,
  ProfilePostgres,
  ReviewPostgres,
  SpecimenPostgres,
  SpeciesPostgres,
  TaxonomyPostgres,
  withAccount,
} from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { countingPool } from "../count-queries";

// FR-POK-13, NFR-12: the shared part of the collector cards against the real database. The taxonomy tree is read once per
// build version and reused by every account; caught state, catch dates, app rarity and the catalog facts are read per
// request.
// The file runs in a database of its own (`createFileDatabase`, as query-count.test.ts, #1301). Its app rarity counts every
// consenting account of the database, and parallel files switch consent on and off for their own accounts in the shared
// database, so a rarity count there changed under these assertions (#1365). Its own `taxon` table needs no taxon lock:
// no taxonomy build of another file can reach this database.
const TZ = "Europe/Berlin";
const run = `cc${randomUUID()
  .replace(/[^a-f]/g, "")
  .padEnd(8, "x")
  .slice(0, 8)}`;
const genus = `Cardcache${run}`;
const FP1 = `cc-${run}-1`;
const FP2 = `cc-${run}-2`;
const provenance = {
  source: "opentree",
  url: "https://example.test/opentree",
  retrievedAt: "2026-10-06T10:00:00Z",
};
const taxon = (latinName: string) => ({
  latinName,
  lineage: {
    ottId: 1,
    acceptedName: latinName,
    genus,
    family: `Cardfamily${run}`,
    order: null,
    provenance,
  },
  text: null,
  genusSpeciesCount: null,
  natureRarity: { iucn: null, occurrences: null },
});
const buildOf = (fingerprint: string, builtAt: string, names: readonly string[]) => ({
  fingerprint,
  builtAt,
  taxa: names.map(taxon),
  failures: [],
});

const alpha = `${genus} alpha`;
const beta = `${genus} beta`;
const gamma = `${genus} gamma`;
const alphaId = randomUUID();
const betaId = randomUUID();
const gammaId = randomUUID();
const operator = randomUUID();
const subA = `cc-a-${randomUUID()}`;
const subB = `cc-b-${randomUUID()}`;

let database: Awaited<ReturnType<typeof createFileDatabase>> | undefined;
let pool: Pool;
let admin: Pool;
const reviewer = async (token: string) =>
  token.startsWith("valid:")
    ? { sub: token.slice(6), email: "x@example.test", name: "T", email_verified: true }
    : null;
const newApp = (p: Pool = pool): Hono => createApp({ reviewer, pool: p });

/**
 * One approved species (reviewed, so it is in the shared tree and the Pokedex facts) with its German name. The operator
 * approves a proposal through the review path, as the build tests do (only reviewers may set the status).
 */
async function approved(id: string, latinName: string, germanName: string) {
  await admin.query(
    "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')",
    [operator, id],
  );
  await admin.query(
    `insert into species (id, genus, epithet, latin_name, german_name, difficulty, standard_level, light_demand_lux,
       growth_measure, etiolation_signs, success_criteria, created_by)
     values ($1, $2, $3, $4, $5, 1, 2, 100, 'height', 'v', 'e', 'user')`,
    [id, genus, latinName.split(" ")[1], latinName, germanName],
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
    body: JSON.stringify({ timeZone: TZ, speciesId, marker: "Karte" }),
  });
  expect(r.status).toBe(201);
}

/** The answer of `GET /pokedex/cards` as sent (text, so byte equality can be checked). */
async function cardsText(app: Hono, sub: string): Promise<string> {
  const r = await app.request(`/pokedex/cards?timeZone=${encodeURIComponent(TZ)}`, {
    headers: { authorization: `Bearer valid:${sub}` },
  });
  expect(r.status).toBe(200);
  return r.text();
}

interface Card {
  species: string;
  state: "caught" | "missing";
  specimenCount: number;
  caughtDate: unknown;
  germanName: string | null;
  appRarity: { owners: number; participants: number; percent: number } | null;
}
const cardsOf = async (app: Hono, sub: string): Promise<Card[]> =>
  (JSON.parse(await cardsText(app, sub)) as { cards: Card[] }).cards;
const cardOf = (cards: readonly Card[], species: string): Card => {
  const card = cards.find((c) => c.species === species);
  if (!card) throw new Error(`no card for ${species}`);
  return card;
};

/** The answer as the route composed it before the shared tree was kept: every part read now, the same core functions. */
async function uncachedAnswer(sub: string): Promise<string> {
  const id = (await admin.query<{ id: string }>("select id from account where subject = $1", [sub]))
    .rows[0]?.id as string;
  const specimens = new SpecimenPostgres(pool);
  const species = new SpeciesPostgres(pool);
  const { caught } = await pokedexOwnership({ specimens, species }, id, TZ);
  const taxa = new TaxonomyPostgres(pool);
  const cards = await readCollectorCards(
    {
      tree: () => taxa.tree(),
      facts: (userId) => species.approvedFacts(userId),
      appRarity: (userId) =>
        readAppRarityBasis(
          {
            participants: new ProfilePostgres(pool),
            owned: new ActiveSpeciesPostgres(pool),
            species,
          },
          userId,
        ),
    },
    id,
    caught,
  );
  return JSON.stringify({ cards });
}

const isTreeRead = (sql: string) => sql.includes("from taxon where status = 'resolved'");

beforeAll(async () => {
  database = await createFileDatabase("pflanzendex_pok_cards");
  pool = openPool(database.ownerUrl);
  admin = openPool(database.fixtureUrl, true);
  await migrate(pool);
  await admin.query("insert into account (id) values ($1)", [operator]);
  await admin.query("insert into account_role (account, role) values ($1, 'operator')", [operator]);
  await approved(alphaId, alpha, "Alphakraut");
  await approved(betaId, beta, "Betakraut");
  await approved(gammaId, gamma, "Gammakraut");
  await new TaxonomyPostgres(pool).replace(buildOf(FP1, "2026-10-06T10:00:00Z", [alpha, beta]));
  // The keepers: A has alpha, B has beta; the catalog is shared, the caught state is not.
  const setup = newApp();
  await plant(setup, subA, alphaId);
  await plant(setup, subB, betaId);
  // The rarity consent is a column of the account's own data row, which the sign-in creates; the test creates it for A.
  await admin.query(
    "insert into account_data (account_id, email) select id, $2 from account where subject = $1",
    [subA, `${subA}@example.test`],
  );
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

describe("FR-POK-13 the shared part of the collector cards", () => {
  it("FR-POK-13 the answer of one keeper is byte-identical to the answer composed from uncached parts", async () => {
    const app = newApp();
    expect(await cardsText(app, subA)).toBe(await uncachedAnswer(subA));
    // A warm second keeper is still the same answer as its uncached composition.
    expect(await cardsText(app, subB)).toBe(await uncachedAnswer(subB));
  });

  it.each([
    ["A first", [subA, subB]],
    ["B first", [subB, subA]],
  ] as const)(
    "FR-POK-13 two keepers with different plants each see only their own caught state, %s",
    async (_label, [first, second]) => {
      const app = newApp();
      const one = await cardsOf(app, first);
      const two = await cardsOf(app, second);
      const caughtBy = (cards: readonly Card[]) =>
        cards.filter((c) => c.state === "caught").map((c) => c.species);
      const plantOf = (sub: string) => (sub === subA ? alpha : beta);
      expect(caughtBy(one)).toEqual([plantOf(first)]);
      expect(caughtBy(two)).toEqual([plantOf(second)]);
      // The shared part (number, names, tree facts) is the same for both; only the caught state differs.
      const CAUGHT_KEYS = ["state", "caughtDate", "specimenCount"];
      const shared = (cards: readonly Card[]) =>
        cards.map((card) => Object.entries(card).filter(([key]) => !CAUGHT_KEYS.includes(key)));
      expect(shared(one)).toEqual(shared(two));
    },
  );

  it("FR-POK-13 the catalog facts are read per request: a corrected German name shows without a new build", async () => {
    const app = newApp();
    expect(cardOf(await cardsOf(app, subA), alpha).germanName).toBe("Alphakraut");
    await admin.query("update species set german_name = $2 where id = $1", [
      alphaId,
      "Alphakraut neu",
    ]);
    expect(cardOf(await cardsOf(app, subA), alpha).germanName).toBe("Alphakraut neu");
    expect(await cardsText(app, subA)).toBe(await uncachedAnswer(subA));
  });

  it("NFR-12 app rarity is read on every request: a change of consent shows at once, without a catalog build", async () => {
    const app = newApp();
    const consent = (on: boolean) =>
      admin.query(
        "update account_data set rarity_consent = $2 where account_id = (select id from account where subject = $1)",
        [subA, on],
      );
    const basis = (cards: readonly Card[]) => {
      const r = cardOf(cards, alpha).appRarity;
      return { owners: r?.owners ?? 0, participants: r?.participants ?? 0 };
    };
    const before = basis(await cardsOf(app, subA));
    await consent(true);
    const after = basis(await cardsOf(app, subA));
    expect(after).toEqual({ owners: before.owners + 1, participants: before.participants + 1 });
    expect(await cardsText(app, subA)).toBe(await uncachedAnswer(subA));
    await consent(false);
    expect(basis(await cardsOf(app, subA))).toEqual(before);
  });

  it("NFR-12 a warm request sends fewer statements than a cold one and does not read the shared tree again", async () => {
    const counter = countingPool(pool);
    const app = newApp(counter.pool);
    counter.reset();
    await cardsText(app, subA);
    const cold = counter.statements();
    counter.reset();
    await cardsText(app, subA);
    const warm = counter.statements();
    expect(warm.length).toBeLessThan(cold.length);
    expect(cold.some(isTreeRead)).toBe(true);
    expect(warm.some(isTreeRead)).toBe(false);
  });

  it("FR-POK-13 a catalog build shows at the next request, and the answer stays the uncached one", async () => {
    const app = newApp();
    expect(cardOf(await cardsOf(app, subA), beta).state).toBe("missing");
    expect((await cardsOf(app, subA)).map((c) => c.species)).not.toContain(gamma);
    await new TaxonomyPostgres(pool).replace(
      buildOf(FP2, "2026-10-07T10:00:00Z", [alpha, beta, gamma]),
    );
    expect((await cardsOf(app, subA)).map((c) => c.species)).toContain(gamma);
    expect(await cardsText(app, subA)).toBe(await uncachedAnswer(subA));
  });
});
