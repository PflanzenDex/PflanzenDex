import { beforeEach, describe, expect, it } from "vitest";
import { leafLogView } from "./view";
import { SpecimenStub } from "../shared/test-helpers";
import { InMemoryLeaves } from "../shared/leaf-test-helpers";
import type { LeafValues } from "./types";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const anna = "anna";

let leaves: InMemoryLeaves;
let switchedOff = false;

const view = (userId = anna, specimenId = E1) =>
  leafLogView(
    {
      leaves,
      specimens: new SpecimenStub({ anna: [E1], ben: [E2] }),
      keeperOff: async () => switchedOff,
    },
    userId,
    specimenId,
  );
const row = (values: Omit<LeafValues, "specimenId">) =>
  leaves.create(anna, { ...values, specimenId: E1 });

beforeEach(() => {
  leaves = new InMemoryLeaves({ anna: [E1], ben: [E2] });
  switchedOff = false;
});

describe("US-WAC-07 the leaves of a plant", () => {
  it("US-WAC-07 the view gives the count, the comparison and the leaves, newest first", async () => {
    await row({ date: "2026-10-01", lengthMm: 20, widthMm: 6, note: null });
    await row({ date: "2026-10-08", lengthMm: 26, widthMm: null, note: "Fensterung" });
    const v = await view();
    expect(v).toMatchObject({
      specimenId: E1,
      keeperOff: false,
      count: 2,
      comparison: { measure: "length", direction: "larger" },
    });
    expect(v?.leaves.map((l) => l.date)).toEqual(["2026-10-08", "2026-10-01"]);
  });

  it("US-WAC-07 without leaves the count is zero and there is no comparison", async () => {
    expect(await view()).toMatchObject({ count: 0, comparison: null, leaves: [] });
  });

  it("US-WAC-07 a foreign or unknown plant gives no view, so the route answers not found (P-04)", async () => {
    await row({ date: "2026-10-01", lengthMm: 20, widthMm: null, note: null });
    expect(await view("ben", E1)).toBeNull();
    expect(await view(anna, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("US-WAC-07 with the keeper switch off no leaves are shown, the stored rows stay and return when on (P-12, P-10)", async () => {
    await row({ date: "2026-10-01", lengthMm: 20, widthMm: null, note: null });
    switchedOff = true;
    expect(await view()).toMatchObject({ keeperOff: true, count: 0, comparison: null, leaves: [] });
    expect(leaves.rows).toHaveLength(1);
    switchedOff = false;
    expect(await view()).toMatchObject({ keeperOff: false, count: 1 });
  });
});
