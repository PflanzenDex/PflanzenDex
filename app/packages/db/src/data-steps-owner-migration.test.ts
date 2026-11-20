import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createFileDatabase,
  dbRoleFindings,
  migrate,
  MIGRATIONS_DIRECTORY,
  openPool,
} from "./kernel/index.ts";

// NFR-15, issue #1809 (owner decision 2026-11-10): migrations run as the plain owner role. The deploy's `migrate` service
// connects as that role (app/config/deploy/docker-compose.yml, DATABASE_URL = pflanzendex_owner). Its test counterpart is
// the owner role of the suite (NOSUPERUSER NOBYPASSRLS, as in deploy). Under forced row security a data step that the
// owner may not see or change matches no row and succeeds silently: 0098, 0112 and 0116 changed nothing on the test host.
// This file seeds a scratch database with the legacy rows as they stood before 0098 (as superuser: the seed writes data,
// it does not test the row rules), migrates it to the end AS THE OWNER, and asserts the effect of every data step.
// A later data step is covered the same way: its legacy rows go into `seedLegacyRows`, its effect into one `it`.

const FIRST_DATA_STEP = "0098_"; // every migration from here on is a data step or follows one
const REDO = "0117_"; // the migration of issue #1809 that redoes the three data steps as the owner
const KEEPER = "a1809000-0000-4000-8000-000000000001";
const OPERATOR = "a1809000-0000-4000-8000-000000000002";
const uid = (n: number) => `e1809000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SPECIES = { curated: uid(1), proposal: uid(2), kept: uid(3) } as const;
const SPECIMEN = {
  keeperRepotted: uid(11),
  keeperNever: uid(12),
  operatorRepotted: uid(13),
} as const;
const OLD_CURATED =
  "Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given";
const NEW_CURATED =
  "Kuratierter Startkatalog (Betreiber): Namen und Familie sind taxonomische Fakten, vom Betreiber eingetragen; Schwierigkeit und Lichtbedarf unbekannt, bis eine Quelle genannt wird";
const OLD_DEV =
  "Dev seed: names and family from common botanical knowledge; difficulty and light need unknown";
const NEW_DEV =
  "Dev-Seed: Namen und Familie aus allgemeinem botanischem Wissen; Schwierigkeit und Lichtbedarf unbekannt";
const UNRELATED = "Source: checked by the operator";

let file: Awaited<ReturnType<typeof createFileDatabase>> | undefined;
let owner: Pool; // the migration runner: the owner role of the scratch database, as in deploy
let fixture: Pool; // superuser of the scratch database: seeds it and reads what the owner's row rules hide
let applied: string[] = [];
const madeDirs: string[] = [];

/** The legacy rows, as the database held them before 0098, 0112 and 0116 (triggers off: plain legacy data). */
async function seedLegacyRows(db: Pool): Promise<void> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    for (const id of [KEEPER, OPERATOR])
      await c.query("insert into account (id) values ($1)", [id]);
    const review = (account: string, species: string, status: string) =>
      c.query(
        "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, $3)",
        [account, species, status],
      );
    await review(OPERATOR, SPECIES.curated, "curated");
    await review(KEEPER, SPECIES.proposal, "proposal");
    await review(OPERATOR, SPECIES.kept, "curated");
    const species = (
      id: string,
      createdBy: string,
      name: string,
      source: string,
      softLeaf: boolean,
    ) =>
      c.query(
        `insert into species (id, created_by, latin_name, genus, epithet, difficulty, standard_level, light_demand_lux,
           growth_measure, etiolation_signs, success_criteria, source, version, soft_leaf)
         values ($1, $2, $3, 'Legacy', $4, 2, 3, 8000, 'height', 'x', 'y', $5, 1, $6)`,
        [id, createdBy, name, name.split(" ")[1], source, softLeaf],
      );
    // The old default `false` on a curated and on a keeper's proposal species (the owner cannot see proposals under
    // catalog_fill, which is why the migration needs the review-sync switch), and a `true` that must stay.
    await species(SPECIES.curated, "operator", "Legacy curated", OLD_CURATED, false);
    await species(SPECIES.proposal, "user", "Legacy proposal", OLD_DEV, false);
    await species(SPECIES.kept, "operator", "Legacy kept", UNRELATED, true);
    const specimen = (
      id: string,
      account: string,
      species: string,
      name: string,
      repotted: string | null,
    ) =>
      c.query(
        `insert into specimen (id, account_id, species_id, name, status, caught_at, repotted_at)
         values ($1, $2, $3, $4, 'plant', '2026-01-10', $5)`,
        [id, account, species, name, repotted],
      );
    await specimen(SPECIMEN.keeperRepotted, KEEPER, SPECIES.proposal, "Ableger 1", "2026-03-15");
    await specimen(SPECIMEN.keeperNever, KEEPER, SPECIES.curated, "Topf 2", null);
    await specimen(SPECIMEN.operatorRepotted, OPERATOR, SPECIES.curated, "Topf O1", "2026-04-02");
    await c.query("commit");
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}

/** The state the three data steps change, read as superuser (the owner's own reads are what the bug hides). */
async function state(db: Pool) {
  const species = await db.query<{ id: string; soft_leaf: boolean | null; source: string | null }>(
    "select id, soft_leaf, source from species order by id",
  );
  const repot = await db.query<{ account_id: string; specimen_id: string; day: string }>(
    `select account_id, specimen_id, to_char(repotted_on, 'YYYY-MM-DD') as day
       from repot order by day, account_id, specimen_id`,
  );
  return { species: species.rows, repot: repot.rows };
}

const row = async (id: string) =>
  (
    await fixture.query<{ soft_leaf: boolean | null; source: string | null }>(
      "select soft_leaf, source from species where id = $1",
      [id],
    )
  ).rows[0];

beforeAll(async () => {
  file = await createFileDatabase("datasteps1809");
  owner = openPool(file.ownerUrl);
  owner.on("error", () => undefined);
  fixture = openPool(file.fixtureUrl, true);
  fixture.on("error", () => undefined);
  const before = mkdtempSync(join(tmpdir(), "data-steps-"));
  madeDirs.push(before);
  for (const f of readdirSync(MIGRATIONS_DIRECTORY).filter(
    (n) => n.endsWith(".sql") && n < FIRST_DATA_STEP,
  ))
    copyFileSync(join(MIGRATIONS_DIRECTORY, f), join(before, f));
  await migrate(owner, { directory: before });
  await seedLegacyRows(fixture);
  applied = await migrate(owner);
}, 120_000);

afterAll(async () => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
  await owner?.end();
  await fixture?.end();
  await file?.drop();
});

describe("NFR-15 (#1809) the data steps of migrations 0098, 0112 and 0116 take effect when the owner role migrates", () => {
  it("NFR-15 (#1809) the migrations ran as the plain owner role: no superuser, no BYPASSRLS, and the role findings are empty", async () => {
    const who = await owner.query<{ super: boolean; bypass: boolean }>(
      "select rolsuper as super, rolbypassrls as bypass from pg_roles where rolname = current_user",
    );
    expect(who.rows[0]).toEqual({ super: false, bypass: false });
    expect(await dbRoleFindings(owner)).toEqual([]);
    expect(applied.some((n) => n.startsWith(FIRST_DATA_STEP))).toBe(true);
  });

  it("NFR-15 (#1809) Given a species with soft leaf false, when the owner migrates, then the flag is unknown (null), curated and proposal alike", async () => {
    expect((await row(SPECIES.curated))?.soft_leaf).toBeNull();
    expect((await row(SPECIES.proposal))?.soft_leaf).toBeNull();
  });

  it("NFR-15 (#1809) Given a species with soft leaf true, when the owner migrates, then the flag stays true", async () => {
    expect((await row(SPECIES.kept))?.soft_leaf).toBe(true);
  });

  it("NFR-15 (#1809) Given the old English source text, when the owner migrates, then the German text is stored, curated and proposal alike", async () => {
    expect((await row(SPECIES.curated))?.source).toBe(NEW_CURATED);
    expect((await row(SPECIES.proposal))?.source).toBe(NEW_DEV);
  });

  it("NFR-15 (#1809) Given a source text that is not the old marker, when the owner migrates, then it is left as it is", async () => {
    expect((await row(SPECIES.kept))?.source).toBe(UNRELATED);
  });

  it("NFR-15 (#1809) Given specimens with a repot day, when the owner migrates, then each has one repot row of its own account, across accounts, and the others none", async () => {
    expect((await state(fixture)).repot).toEqual([
      { account_id: KEEPER, specimen_id: SPECIMEN.keeperRepotted, day: "2026-03-15" },
      { account_id: OPERATOR, specimen_id: SPECIMEN.operatorRepotted, day: "2026-04-02" },
    ]);
  });

  it("NFR-15 (#1809) the data step is idempotent: a second run of its statements and a second migrate change nothing", async () => {
    const redo = readdirSync(MIGRATIONS_DIRECTORY).find((n) => n.startsWith(REDO));
    if (redo === undefined) throw new Error(`no migration ${REDO}* exists`);
    const once = await state(fixture);
    await owner.query(readFileSync(join(MIGRATIONS_DIRECTORY, redo), "utf8"));
    expect(await state(fixture)).toEqual(once);
    expect(await migrate(owner)).toEqual([]);
  });
});
