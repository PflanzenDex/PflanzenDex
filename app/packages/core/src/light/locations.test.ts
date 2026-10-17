import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel/operation";
import type { Operation } from "../kernel/operation";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { lightZoneCreate, locationUpdate, locationSetUp, locationHints } from "./index";
import { InMemoryLight } from "./test-helpers";

let store: InMemoryLight;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const anna = { userId: "anna" };
const ben = { userId: "ben" };

const call = <E, A>(op: Operation<E, A>, input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++counter}` });

const setUp = () => locationSetUp(store.locationAdapter());
const zone = async (user = anna) => {
  const r = await call(
    lightZoneCreate(store.zoneAdapter()),
    { name: "Lampe 2", luxCeiling: 15000 },
    user,
  );
  if (!r.ok) throw new Error("Create failed");
  return r.value;
};

beforeEach(() => {
  store = new InMemoryLight();
  idem = new InMemoryIdempotencyStore();
});

describe("US-LIC-05 create and change location", () => {
  it("creates a location with name, light zone and kind; any number per zone", async () => {
    const z = await zone();
    for (const name of ["Regal", "Fensterbank", "Balkon"]) {
      const r = await call(setUp(), {
        name,
        lightZoneId: z.id,
        kind: name === "Balkon" ? "outdoor" : "indoor",
      });
      expect(r.ok).toBe(true);
    }
    expect(store.locations.map((s) => s.lightZoneId)).toEqual([z.id, z.id, z.id]);
    expect(store.locations[2]?.kind).toBe("outdoor");
  });

  it.each([
    [{ name: "", kind: "indoor" }, "name"],
    [{ name: "Regal", kind: "draussen" }, "kind"],
    [{ name: "Regal", kind: "indoor", lightZoneId: "no-id" }, "lightZoneId"],
  ])("rejects %j and writes nothing (field %s)", async (input, field) => {
    const r = await call(setUp(), input);
    expect(!r.ok && r.error.details?.map((d) => d.field)).toEqual([field]);
    expect(store.locations).toHaveLength(0);
  });

  it("the name is unique per account", async () => {
    await call(setUp(), { name: "Regal", kind: "indoor" });
    const r = await call(setUp(), { name: "regal", kind: "outdoor" });
    expect(!r.ok && r.error.code).toBe("location.name_taken");
    expect((await call(setUp(), { name: "Regal", kind: "indoor" }, ben)).ok).toBe(true);
  });

  it("a zone of another account cannot be assigned (P-04)", async () => {
    const foreign = await zone(ben);
    const r = await call(setUp(), { name: "Regal", lightZoneId: foreign.id, kind: "indoor" });
    expect(!r.ok && r.error.code).toBe("light_zone.not_found");
    expect(store.locations).toHaveLength(0);
  });

  it("changes zone and kind; a foreign location is unreachable", async () => {
    const z = await zone();
    const s = await call(setUp(), { name: "Regal", kind: "indoor" });
    if (!s.ok) throw new Error("Create failed");
    const r = await call(locationUpdate(store.locationAdapter()), {
      id: s.value.id,
      name: "Regal",
      lightZoneId: z.id,
      kind: "outdoor",
    });
    expect(r.ok && r.value).toMatchObject({ lightZoneId: z.id, kind: "outdoor" });
    const foreign = await call(
      locationUpdate(store.locationAdapter()),
      { id: s.value.id, name: "Meins", kind: "indoor" },
      ben,
    );
    expect(!foreign.ok && foreign.error.code).toBe("location.not_found");
  });

  it("renaming to an existing other name: name_taken", async () => {
    await call(setUp(), { name: "A", kind: "indoor" });
    const b = await call(setUp(), { name: "B", kind: "indoor" });
    if (!b.ok) throw new Error("Create failed");
    const r = await call(locationUpdate(store.locationAdapter()), {
      id: b.value.id,
      name: "A",
      kind: "indoor",
    });
    expect(!r.ok && r.error.code).toBe("location.name_taken");
  });
});

describe('US-LIC-05 locations without a zone appear in "Hints"', () => {
  it("names every location without a zone with the next action (P-09)", () => {
    const hints = locationHints([
      { id: "s1", name: "Regal", lightZoneId: "z1", kind: "indoor" },
      { id: "s2", name: "Balkon", lightZoneId: null, kind: "outdoor" },
    ]);
    expect(hints).toEqual([
      expect.objectContaining({ kind: "location_without_zone", locationId: "s2" }),
    ]);
    expect(hints[0]?.text).toContain("Balkon");
    expect(hints[0]?.nextAction).toMatch(/Lichtzone/);
  });

  it("without affected locations there are no hints", () => {
    expect(locationHints([])).toEqual([]);
  });
});
