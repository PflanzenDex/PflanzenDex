import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { specimenSetLocation } from "../index";
import { InMemorySpecimens } from "../shared/test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const LOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOC_BEN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const anna = { userId: "anna" };

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const locate = (
  specimenId: unknown,
  locationId: unknown,
  opt: { context?: { userId: string | null }; key?: string } = {},
) =>
  execute(
    specimenSetLocation({ specimens }),
    { idempotency: idem },
    {
      context: opt.context ?? anna,
      input: { specimenId, locationId },
      idempotencyKey: opt.key ?? `k${++counter}`,
    },
  );

const create = async (
  userId: string,
  name: string,
  extra: { locationId?: string | null; status?: "plant" | "cutting" } = {},
) => {
  const r = await specimens.create(userId, {
    speciesId: SPECIES,
    name,
    marker: null,
    locationId: extra.locationId ?? null,
    caughtAt: "2026-09-01",
    status: extra.status ?? "plant",
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};

beforeEach(() => {
  specimens = new InMemorySpecimens({ anna: [LOC_A, LOC_B], ben: [LOC_BEN] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-PHA-03 set the location of a specimen", () => {
  it("US-PHA-03: a specimen without a location gets the chosen one, everything else stays", async () => {
    const z = await create("anna", "Bogenhanf");
    const r = await locate(z.id, LOC_A);
    expect(r.ok && r.value).toEqual({ ...z, locationId: LOC_A });
  });

  it("US-PHA-03: a cutting can be placed too, it stays a cutting (US-BES-04)", async () => {
    const z = await create("anna", "Steckling", { status: "cutting" });
    const r = await locate(z.id, LOC_B);
    expect(r.ok && r.value).toMatchObject({ status: "cutting", locationId: LOC_B });
  });

  it("US-PHA-03: setting the same location again is a no-op and succeeds with a new key (idempotent, US-QS-03)", async () => {
    const z = await create("anna", "Bogenhanf", { locationId: LOC_A });
    const first = await locate(z.id, LOC_A);
    const second = await locate(z.id, LOC_A);
    expect(first.ok && second.ok && second.value).toEqual(first.ok && first.value);
    expect(specimens.rows.filter((row) => row.locationId === LOC_A)).toHaveLength(1);
  });

  it("US-PHA-03: the same key twice writes once and answers the same", async () => {
    const z = await create("anna", "Bogenhanf");
    const first = await locate(z.id, LOC_A, { key: "same" });
    const writes = specimens.writes;
    const again = await locate(z.id, LOC_A, { key: "same" });
    expect(again).toEqual(first);
    expect(specimens.writes).toBe(writes);
  });

  it("US-PHA-03: an archived specimen stays unchanged and reports specimen.archived (US-BES-07)", async () => {
    const z = await create("anna", "Alt");
    await specimens.archive("anna", z.id, "eingegangen", "2026-10-01");
    const before = specimens.writes;
    const r = await locate(z.id, LOC_A);
    expect(!r.ok && r.error.code).toBe("specimen.archived");
    expect(specimens.writes).toBe(before);
  });

  it("US-PHA-03: a foreign specimen looks like an unknown one (P-04)", async () => {
    const foreign = await create("ben", "Bens Pflanze", { locationId: LOC_BEN });
    const r = await locate(foreign.id, LOC_A);
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect((await specimens.find("ben", foreign.id))?.locationId).toBe(LOC_BEN);
  });

  it("US-PHA-03: a location of another account is refused and nothing is written (P-04)", async () => {
    const z = await create("anna", "Bogenhanf");
    const before = specimens.writes;
    const r = await locate(z.id, LOC_BEN);
    expect(!r.ok && r.error.code).toBe("location.not_found");
    expect(specimens.writes).toBe(before);
    expect((await specimens.find("anna", z.id))?.locationId).toBeNull();
  });

  it("US-PHA-03: free text instead of IDs writes nothing and reports input.invalid with both fields", async () => {
    const r = await locate("Bogenhanf", "Fensterbank");
    expect(r).toMatchObject({
      ok: false,
      error: {
        code: "input.invalid",
        details: [
          { field: "specimenId", code: "input.invalid" },
          { field: "locationId", code: "input.invalid" },
        ],
      },
    });
    expect(specimens.writes).toBe(0);
  });

  it("US-PHA-03: without sign-in nothing happens", async () => {
    const z = await create("anna", "Bogenhanf");
    const r = await locate(z.id, LOC_A, { context: { userId: null } });
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
  });
});
