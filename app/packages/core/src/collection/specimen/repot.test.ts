import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { specimenRepot } from "../index";
import { InMemorySpecimens } from "../shared/test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const anna = { userId: "anna" };
const ben = { userId: "ben" };

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const repot = (
  specimenId: string,
  opt: { context?: { userId: string | null }; key?: string } = {},
) =>
  execute(
    specimenRepot({ specimens }),
    { idempotency: idem },
    {
      context: opt.context ?? anna,
      input: { specimenId },
      idempotencyKey: opt.key ?? `k${++counter}`,
    },
  );

const create = async (userId: string, name: string, status: "plant" | "cutting") => {
  const r = await specimens.create(userId, {
    speciesId: SPECIES,
    name,
    marker: null,
    locationId: null,
    caughtAt: "2026-09-01",
    status,
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};

beforeEach(() => {
  specimens = new InMemorySpecimens();
  idem = new InMemoryIdempotencyStore();
});

describe("US-BES-04 repotted", () => {
  it("US-BES-04: a cutting becomes a plant, everything else stays unchanged", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const r = await repot(cutting.id);
    expect(r.ok && r.value).toEqual({ ...cutting, status: "plant" });
  });

  it("US-BES-04: a plant is not a cutting, the status stays and nothing is written", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    const before = specimens.writes;
    const r = await repot(plant.id);
    expect(!r.ok && r.error.code).toBe("specimen.not_a_cutting");
    expect(specimens.writes).toBe(before);
  });

  it("US-BES-04: an archived cutting is not repotted", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    await specimens.archive("anna", cutting.id, "abgegeben", "2026-10-01");
    const r = await repot(cutting.id);
    expect(!r.ok && r.error.code).toBe("specimen.not_a_cutting");
    expect((await specimens.find("anna", cutting.id))?.status).toBe("archived");
  });

  it("US-BES-04: a cutting of another account looks like an unknown one (P-04)", async () => {
    const foreign = await create("ben", "Bogenhanf", "cutting");
    const r = await repot(foreign.id, { context: anna });
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect((await specimens.find("ben", foreign.id))?.status).toBe("cutting");
    expect((await repot(foreign.id, { context: ben })).ok).toBe(true);
  });

  it("US-BES-04: an unknown id is not found, an invalid one is rejected", async () => {
    const r = await repot("00000000-0000-4000-8000-0000000000ff");
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    const invalid = await repot("broken");
    expect(!invalid.ok && invalid.error.details).toEqual([
      { field: "specimenId", code: "input.invalid" },
    ]);
  });

  it("US-BES-04: the same request with the same key repeats the first answer (P-03)", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const first = await repot(cutting.id, { key: "same" });
    const before = specimens.writes;
    const second = await repot(cutting.id, { key: "same" });
    expect(second).toEqual(first);
    expect(specimens.writes).toBe(before);
  });

  it("US-BES-04: without sign-in it is refused", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const r = await repot(cutting.id, { context: { userId: null } });
    expect(r.ok).toBe(false);
    expect((await specimens.find("anna", cutting.id))?.status).toBe("cutting");
  });
});
