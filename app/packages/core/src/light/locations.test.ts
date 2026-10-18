import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel/operation";
import type { Operation } from "../kernel/operation";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import {
  lightZoneCreate,
  lightZoneDefault,
  locationDefault,
  locationDelete,
  locationUpdate,
  locationSetUp,
  locationHints,
} from "./index";
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

describe("US-ONB-02 default location and removal", () => {
  const makeDefault = () => locationDefault(store.locationAdapter(), store.zoneAdapter());

  it("creates Zuhause under the second lamp when the account has the standard lamps", async () => {
    await call(lightZoneDefault(store.zoneAdapter()), {});
    const r = await call(makeDefault(), {});
    expect(r.ok && r.value).toMatchObject({ name: "Zuhause", kind: "indoor" });
    const lamp2 = store.listZones("anna")[1];
    expect(r.ok && r.value.lightZoneId).toBe(lamp2?.id);
  });

  it("creates Zuhause without a zone when there are no zones", async () => {
    const r = await call(makeDefault(), {});
    expect(r.ok && r.value.lightZoneId).toBeNull();
  });

  it("is refused for an account that already has a location, and is per account", async () => {
    await call(setUp(), { name: "Fensterbank", kind: "indoor" });
    const r = await call(makeDefault(), {});
    expect(!r.ok && r.error.code).toBe("location.not_empty");
    expect((await call(makeDefault(), {}, ben)).ok).toBe(true);
  });

  it("removes an unused location, refuses a used one and a foreign or unknown one", async () => {
    const made = await call(setUp(), { name: "Flur", kind: "indoor" });
    if (!made.ok) throw new Error("setup");
    const del = locationDelete(store.locationAdapter(), []);
    const foreign = await call(del, { id: made.value.id }, ben);
    expect(!foreign.ok && foreign.error.code).toBe("location.not_found");
    store.occupied.add(made.value.id);
    const used = await call(del, { id: made.value.id });
    expect(!used.ok && used.error.code).toBe("location.in_use");
    store.occupied.clear();
    expect((await call(del, { id: made.value.id })).ok).toBe(true);
    expect(store.listLocations("anna")).toHaveLength(0);
  });

  it("US-ONB-02 refuses to remove a location a module still uses, e.g. a sensor (P-10)", async () => {
    const made = await call(setUp(), { name: "Flur", kind: "indoor" });
    if (!made.ok) throw new Error("setup");
    const sensor = { user: async () => [{ kind: "equipment" as const, id: "q1", name: "Sensor" }] };
    const r = await call(locationDelete(store.locationAdapter(), [sensor]), { id: made.value.id });
    expect(!r.ok && r.error.code).toBe("location.in_use");
    expect(store.listLocations("anna")).toHaveLength(1);
  });
});
