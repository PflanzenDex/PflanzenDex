import { describe, expect, it } from "vitest";
import { planMarkers, type MarkerAnswer } from "../../../shared/markers";
import { specimenName } from "../../../shared/name";
import { isActive, type SpecimenRow } from "../../../shared/types";
import { InMemorySpecimens, testSpecies } from "../../../shared/test-helpers";
import { judgeMarkers, type ExistingMarkers, type IncomingRow, type MarkerFlag } from "./markers";

// The marker rules of US-BES-03 and DM-BES-03 as `planMarkers` applies them to one create. The preview judges the whole file
// before anything is written, so it is checked against the creates: every row it does not flag is accepted when the file is
// imported in order, and a file with a flag cannot be imported as it stands (US-BES-18).
const ANNA = "anna";
const SPECIES = testSpecies("11111111-1111-4111-8111-111111111111");
const NAME = "Bogenhanf";
const LINE_OF = (index: number) => index + 2;

interface Shape {
  /** Active specimens of the species before the import: a marker or none (at most one unmarked: the name is unique). */
  readonly active: readonly (string | null)[];
  /** Archived specimens of the species: their markers stay taken (US-BES-07). */
  readonly archived: readonly string[];
  /** The markers of the incoming rows in file order (`null` for none). */
  readonly rows: readonly (string | null)[];
}

async function seeded(shape: Shape): Promise<InMemorySpecimens> {
  const store = new InMemorySpecimens({ [ANNA]: [] });
  const plant = (marker: string | null) => ({
    speciesId: SPECIES.id,
    name: specimenName(NAME, marker),
    marker,
    locationId: null,
    lightZoneId: null,
    caughtAt: "2026-10-01",
    status: "plant" as const,
  });
  for (const marker of shape.active) await store.create(ANNA, plant(marker));
  for (const marker of shape.archived) {
    const row = await store.create(ANNA, plant(marker));
    if (typeof row === "object") await store.archive(ANNA, row.id, "eingegangen", "2026-10-02");
  }
  return store;
}

const siblingsOf = async (store: InMemorySpecimens): Promise<SpecimenRow[]> =>
  [...(await store.list(ANNA))].filter((z) => z.speciesId === SPECIES.id);

function existingOf(siblings: readonly SpecimenRow[]): ExistingMarkers {
  const active = siblings.filter(isActive);
  return {
    active: active.length,
    taken: siblings.flatMap((z) => (z.marker === null ? [] : [z.marker])),
    unmarked: active.filter((z) => z.marker === null).map((z) => ({ id: z.id, name: z.name })),
  };
}

/** The answers the keeper gives: one marker per existing specimen without one. */
const answersFor = (existing: ExistingMarkers, answered: boolean): MarkerAnswer[] =>
  answered ? existing.unmarked.map((u, i) => ({ specimenId: u.id, marker: `u${i + 1}` })) : [];

/** The judge of the preview on the whole file. */
async function judged(shape: Shape, answered: boolean): Promise<readonly MarkerFlag[]> {
  const existing = existingOf(await siblingsOf(await seeded(shape)));
  const rows: IncomingRow[] = shape.rows.map((marker, i) => ({ line: LINE_OF(i), marker }));
  return judgeMarkers(existing, rows, answersFor(existing, answered));
}

/**
 * The creates of the rows in file order, skipping the lines in `skip`: `planMarkers` decides each one on the specimens
 * as they are then, the answers go to the first row that makes the third active specimen, and a refused row writes nothing.
 * Returns the lines that were refused.
 */
async function refusedByCreate(shape: Shape, answered: boolean, skip: ReadonlySet<number>) {
  const store = await seeded(shape);
  let pending: readonly MarkerAnswer[] = answersFor(existingOf(await siblingsOf(store)), answered);
  const refused = new Set<number>();
  for (const [i, marker] of shape.rows.entries()) {
    const line = LINE_OF(i);
    if (skip.has(line)) continue;
    const siblings = await siblingsOf(store);
    const attach = siblings.filter(isActive).length + 1 >= 3 ? pending : [];
    const plan = planMarkers({ speciesName: NAME, marker, answers: attach, siblings });
    if (plan.kind === "failed") {
      refused.add(line);
      continue;
    }
    const row = await store.create(ANNA, { ...plantValues(marker) }, plan.assignments);
    if (typeof row !== "object") refused.add(line);
    else if (attach.length > 0) pending = [];
  }
  return refused;
}

const plantValues = (marker: string | null) => ({
  speciesId: SPECIES.id,
  name: specimenName(NAME, marker),
  marker,
  locationId: null,
  lightZoneId: null,
  caughtAt: "2026-10-03",
  status: "plant" as const,
});

const linesOf = (flags: readonly MarkerFlag[]) => new Set(flags.map((f) => f.line));

// Every file shape: existing specimens (with and without a marker, archived ones) and rows with and without markers, each with
// and without the answers for the existing specimens.
const EXISTING: readonly (readonly (string | null)[])[] = [
  [],
  [null],
  ["e1"],
  ["e1", "e2"],
  [null, "e1"],
  [null, "e1", "e2"],
  ["e1", "e2", "e3"],
];
const ARCHIVED: readonly (readonly string[])[] = [[], ["z"]];
const ALPHABET: readonly (string | null)[] = [null, "a", "b", "z"];

/** Every file of one to three rows over the alphabet: at most one row without a marker, no two rows with the same marker. */
function allRowSequences(): (string | null)[][] {
  const out: (string | null)[][] = [];
  const extend = (prefix: (string | null)[]) => {
    if (prefix.length > 0) out.push(prefix);
    if (prefix.length === 3) return;
    for (const m of ALPHABET) {
      if (m !== null && prefix.includes(m)) continue;
      if (m === null && prefix.includes(null)) continue;
      extend([...prefix, m]);
    }
  };
  extend([]);
  return out;
}

describe("US-BES-18 the marker rules of an import agree with the create (US-BES-03, DM-BES-03)", () => {
  it("US-BES-18 every row the preview does not flag is created, and a flagged file is refused somewhere", async () => {
    let checked = 0;
    for (const active of EXISTING)
      for (const archived of ARCHIVED)
        for (const rows of allRowSequences())
          for (const answered of [false, true]) {
            const shape: Shape = { active, archived, rows };
            const flagged = linesOf(await judged(shape, answered));
            const refusedRest = await refusedByCreate(shape, answered, flagged);
            const refusedAll = await refusedByCreate(shape, answered, new Set());
            expect({ shape, answered, refusedRest: [...refusedRest] }).toEqual({
              shape,
              answered,
              refusedRest: [],
            });
            expect({ shape, answered, refusedAll: refusedAll.size > 0 }).toEqual({
              shape,
              answered,
              refusedAll: flagged.size > 0,
            });
            checked += 1;
          }
    expect(checked).toBeGreaterThan(500);
  });

  it("US-BES-18 with no plant yet the first row may stay without a marker, the second needs one", async () => {
    expect(linesOf(await judged({ active: [], archived: [], rows: [null, null] }, false))).toEqual(
      new Set([3]),
    );
    expect(linesOf(await judged({ active: [], archived: [], rows: ["a", null] }, false))).toEqual(
      new Set([3]),
    );
    expect(await judged({ active: [], archived: [], rows: [null, "a"] }, false)).toEqual([]);
  });

  it("US-BES-18 three rows of one species without markers are all flagged, the first too", async () => {
    const flags = await judged({ active: [], archived: [], rows: [null, null, null] }, false);
    expect(flags.map((f) => [f.line, f.code])).toEqual([
      [2, "specimen.marker_required"],
      [3, "specimen.marker_required"],
      [4, "specimen.marker_required"],
    ]);
  });

  it("US-BES-18 the row that makes the third active specimen needs the answers of the existing ones", async () => {
    const missing = await judged({ active: [null], archived: [], rows: ["a", "b"] }, false);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ line: 3, code: "specimen.markers_missing" });
    expect(missing[0]?.missing).toHaveLength(1);
    expect(await judged({ active: [null], archived: [], rows: ["a", "b"] }, true)).toEqual([]);
  });

  it("US-BES-18 a marker that an archived specimen uses is taken (US-BES-07)", async () => {
    const flags = await judged({ active: [], archived: ["z"], rows: ["Z"] }, false);
    expect(flags).toEqual([{ line: 2, code: "specimen.marker_taken" }]);
  });

  it("US-BES-18 an answer that clashes with the marker of the row that receives it is taken", async () => {
    const store = await seeded({ active: [null], archived: [], rows: [] });
    const existing = existingOf(await siblingsOf(store));
    const answers: MarkerAnswer[] = [{ specimenId: existing.unmarked[0]?.id ?? "", marker: "a" }];
    const rows: IncomingRow[] = [
      { line: 2, marker: "b" },
      { line: 3, marker: "a" },
    ];
    expect(judgeMarkers(existing, rows, answers)).toEqual([
      { line: 3, code: "specimen.marker_taken" },
    ]);
  });
});
