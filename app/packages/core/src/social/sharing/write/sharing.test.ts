import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { sharingList, sharingSet, sharingSetSpecies } from "../index";
import { InMemorySharing, InMemorySpecimens } from "../test-helpers";

const S1 = "00000000-0000-4000-8000-0000000000a1";
const S2 = "00000000-0000-4000-8000-0000000000a2";
const S3 = "00000000-0000-4000-8000-0000000000a3";
const SP_A = "00000000-0000-4000-8000-0000000000e1";
const SP_B = "00000000-0000-4000-8000-0000000000e2";
const FOREIGN = "00000000-0000-4000-8000-0000000000f1";
const anna = { userId: "anna" };

let sharing: InMemorySharing;
let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let n = 0;
const deps = () => ({ sharing, specimens });
const run = <E, A>(op: Parameters<typeof execute<E, A>>[0], input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++n}` });
const errorOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(() => {
  sharing = new InMemorySharing();
  idem = new InMemoryIdempotencyStore();
  specimens = new InMemorySpecimens({
    anna: [
      { id: S1, speciesId: SP_A, status: "plant" },
      { id: S2, speciesId: SP_A, status: "cutting" },
      { id: S3, speciesId: SP_A, status: "archived" },
      { id: "00000000-0000-4000-8000-0000000000a4", speciesId: SP_B, status: "plant" },
    ],
    ben: [{ id: FOREIGN, speciesId: SP_A, status: "plant" }],
  });
});

describe("US-SOZ-04 decide what friends see", () => {
  it("US-SOZ-04 every specimen is private by default: nothing is shared without a decision (P-05)", async () => {
    expect(await sharingList({ sharing }, "anna")).toEqual({ shared: [] });
  });

  it("US-SOZ-04 sharing a specimen with friends and photos off, then withdrawing it again", async () => {
    expect(await run(sharingSet(deps()), { specimenId: S1, share: "friends" })).toMatchObject({
      ok: true,
      value: { share: "friends", photos: false },
    });
    expect(await sharingList({ sharing }, "anna")).toEqual({
      shared: [{ specimenId: S1, photos: false }],
    });
    await run(sharingSet(deps()), { specimenId: S1, share: "private" });
    expect((await sharingList({ sharing }, "anna")).shared).toEqual([]);
  });

  it("US-SOZ-04 Share_Photos is stored with the sharing and is off when a specimen is private", async () => {
    await run(sharingSet(deps()), { specimenId: S1, share: "friends", photos: true });
    expect((await sharingList({ sharing }, "anna")).shared).toEqual([
      { specimenId: S1, photos: true },
    ]);
    expect(
      await run(sharingSet(deps()), { specimenId: S1, share: "private", photos: true }),
    ).toMatchObject({ ok: true, value: { share: "private", photos: false } });
  });

  it("US-SOZ-04 a specimen of someone else or an unknown one is not found and nothing is written (P-04)", async () => {
    expect(errorOf(await run(sharingSet(deps()), { specimenId: FOREIGN, share: "friends" }))).toBe(
      "specimen.not_found",
    );
    expect(sharing.writes).toBe(0);
  });

  it("US-SOZ-04 an archived specimen cannot be shared but can be withdrawn", async () => {
    expect(errorOf(await run(sharingSet(deps()), { specimenId: S3, share: "friends" }))).toBe(
      "specimen.archived",
    );
    expect(await run(sharingSet(deps()), { specimenId: S3, share: "private" })).toMatchObject({
      ok: true,
    });
  });

  it("US-SOZ-04 bad input is refused before anything is written", async () => {
    expect(errorOf(await run(sharingSet(deps()), { specimenId: S1, share: "everyone" }))).toBe(
      "input.invalid",
    );
    expect(
      errorOf(await run(sharingSet(deps()), { specimenId: S1, share: "friends", photos: "yes" })),
    ).toBe("input.invalid");
    expect(errorOf(await run(sharingSet(deps()), { specimenId: "x", share: "friends" }))).toBe(
      "input.invalid",
    );
    expect(sharing.writes).toBe(0);
  });

  it("US-SOZ-04 bulk: shares every active specimen of a species in one go and says how many", async () => {
    expect(
      await run(sharingSetSpecies(deps()), { speciesId: SP_A, share: "friends" }),
    ).toMatchObject({ ok: true, value: { changed: 2 } });
    expect(sharing.writes).toBe(1);
    expect((await sharingList({ sharing }, "anna")).shared.map((r) => r.specimenId).sort()).toEqual(
      [S1, S2],
    );
  });

  it("US-SOZ-04 bulk withdrawing and a species without specimens answer clearly (0 changed, P-10)", async () => {
    await run(sharingSetSpecies(deps()), { speciesId: SP_A, share: "friends" });
    await run(sharingSetSpecies(deps()), { speciesId: SP_A, share: "private" });
    expect((await sharingList({ sharing }, "anna")).shared).toEqual([]);
    expect(
      await run(sharingSetSpecies(deps()), { speciesId: FOREIGN, share: "friends" }),
    ).toMatchObject({ ok: true, value: { changed: 0 } });
  });

  it("US-SOZ-04 the settings of another account are not touched", async () => {
    await run(sharingSet(deps()), { specimenId: S1, share: "friends" });
    expect(await sharingList({ sharing }, "ben")).toEqual({ shared: [] });
  });
});
