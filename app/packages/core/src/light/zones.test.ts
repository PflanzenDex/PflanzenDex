import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel/operation";
import type { Operation } from "../kernel/operation";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import {
  lightZoneUpdate,
  lightZoneCreate,
  lightZoneDelete,
  lightZoneDefault,
  locationUpdate,
  locationSetUp,
} from "./index";
import { InMemoryLight, fixedUsage } from "./test-helpers";

let store: InMemoryLight;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const anna = { userId: "anna" };
const ben = { userId: "ben" };

const call = <E, A>(op: Operation<E, A>, input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++counter}` });

const create = () => lightZoneCreate(store.zoneAdapter());
const remove = (extra = fixedUsage([])) =>
  lightZoneDelete(store.zoneAdapter(), [store.locationUsage(), extra]);

beforeEach(() => {
  store = new InMemoryLight();
  idem = new InMemoryIdempotencyStore();
});

describe("US-LIC-05 create and change light zone", () => {
  it("creates a zone with name, lux ceiling, optional PPFD and order", async () => {
    const r = await call(create(), {
      name: " Regal oben ",
      luxCeiling: 15000,
      ppfd: 300,
      sortOrder: 2,
    });
    expect(r.ok && r.value).toMatchObject({
      name: "Regal oben",
      luxCeiling: 15000,
      ppfd: 300,
      sortOrder: 2,
    });
  });

  it("PPFD and order are optional; the order is then appended at the end", async () => {
    await call(create(), { name: "A", luxCeiling: 1500, sortOrder: 5 });
    const r = await call(create(), { name: "B", luxCeiling: 3000 });
    expect(r.ok && r.value).toMatchObject({ ppfd: null, sortOrder: 6 });
  });

  it.each([
    [{ name: "", luxCeiling: 100 }, "name"],
    [{ name: "A", luxCeiling: 0 }, "luxCeiling"],
    [{ name: "A", luxCeiling: 1.5 }, "luxCeiling"],
    [{ name: "A", luxCeiling: "viel" }, "luxCeiling"],
    [{ name: "A", luxCeiling: 100, ppfd: -3 }, "ppfd"],
    [{ name: "A", luxCeiling: 100, sortOrder: 1.2 }, "sortOrder"],
  ])("rejects %j and writes nothing (field %s)", async (input, field) => {
    const r = await call(create(), input);
    expect(!r.ok && r.error.details?.map((d) => d.field)).toEqual([field]);
    expect(store.zones).toHaveLength(0);
  });

  it("the name is unique per account, at other accounts it may occur again (P-04)", async () => {
    await call(create(), { name: "Lampe 2", luxCeiling: 15000 });
    const duplicate = await call(create(), { name: "lampe 2", luxCeiling: 1 });
    expect(!duplicate.ok && duplicate.error.code).toBe("light_zone.name_taken");
    expect((await call(create(), { name: "Lampe 2", luxCeiling: 1 }, ben)).ok).toBe(true);
  });

  it("changes values and renames without the id changing", async () => {
    const fresh = await call(create(), { name: "Lampe 2", luxCeiling: 15000 });
    if (!fresh.ok) throw new Error("Create failed");
    const r = await call(lightZoneUpdate(store.zoneAdapter()), {
      id: fresh.value.id,
      name: "Unterholz",
      luxCeiling: 12000,
      ppfd: 250,
    });
    expect(r.ok && r.value).toMatchObject({
      id: fresh.value.id,
      name: "Unterholz",
      luxCeiling: 12000,
      ppfd: 250,
    });
    expect(store.zones).toHaveLength(1);
  });

  it("a foreign or unknown zone cannot be changed", async () => {
    const fresh = await call(create(), { name: "Lampe 2", luxCeiling: 15000 });
    if (!fresh.ok) throw new Error("Create failed");
    const r = await call(
      lightZoneUpdate(store.zoneAdapter()),
      { id: fresh.value.id, name: "Mein", luxCeiling: 1 },
      ben,
    );
    expect(!r.ok && r.error.code).toBe("light_zone.not_found");
    expect(store.zones[0]?.name).toBe("Lampe 2");
  });
});

describe("US-LIC-05 delete light zone: no silent deletion (P-10)", () => {
  const zone = async () => {
    const r = await call(create(), { name: "Lampe 3", luxCeiling: 100000 });
    if (!r.ok) throw new Error("Create failed");
    return r.value;
  };

  it("deletes an unused zone", async () => {
    const z = await zone();
    const r = await call(remove(), { id: z.id });
    expect(r.ok).toBe(true);
    expect(store.zones).toHaveLength(0);
  });

  it("rejects if locations use the zone, and names them", async () => {
    const z = await zone();
    await call(locationSetUp(store.locationAdapter()), {
      name: "Regal",
      lightZoneId: z.id,
      kind: "indoor",
    });
    const r = await call(remove(), { id: z.id });
    expect(!r.ok && r.error.code).toBe("light_zone.in_use");
    expect(!r.ok && r.error.data).toEqual([
      { kind: "location", id: expect.any(String), name: "Regal" },
    ]);
    expect(store.zones).toHaveLength(1);
  });

  it("rejects if specimens or species use the zone, and names all (mechanism via the port)", async () => {
    const z = await zone();
    const user = [
      { kind: "specimen", id: "e1", name: "Monstera Nr. 1" },
      { kind: "species", id: "a1", name: "Echinopsis" },
    ] as const;
    const r = await call(remove(fixedUsage(user)), { id: z.id });
    expect(!r.ok && r.error.code).toBe("light_zone.in_use");
    expect(!r.ok && r.error.data).toEqual(user);
    expect(store.zones).toHaveLength(1);
  });

  it("also reports the adapter's fallback (newly arisen usage) as in_use", async () => {
    const z = await zone();
    const adapter = { ...store.zoneAdapter(), remove: async () => "in_use" as const };
    const r = await call(lightZoneDelete(adapter, []), { id: z.id });
    expect(!r.ok && r.error.code).toBe("light_zone.in_use");
  });

  it("an unknown zone: not found", async () => {
    const r = await call(remove(), { id: "00000000-0000-4000-8000-0000000000ff" });
    expect(!r.ok && r.error.code).toBe("light_zone.not_found");
  });
});

describe("US-LIC-05 default (FR-LIC-01)", () => {
  it("creates the four lamps of the specification for an account without zones", async () => {
    const r = await call(lightZoneDefault(store.zoneAdapter()), {});
    expect(r.ok && r.value.map((z) => [z.name, z.luxCeiling, z.ppfd, z.sortOrder])).toEqual([
      ["Lampe 1", 1500, 36, 1],
      ["Lampe 2", 15000, 300, 2],
      ["Lampe 3", 100000, 1600, 3],
      ["Lampe 4", 110000, 2000, 4],
    ]);
  });

  it("rejects if the account already has zones, and changes nothing", async () => {
    await call(create(), { name: "Eigene", luxCeiling: 5000 });
    const r = await call(lightZoneDefault(store.zoneAdapter()), {});
    expect(!r.ok && r.error.code).toBe("light_zone.not_empty");
    expect(store.zones).toHaveLength(1);
  });
});

describe("US-LIC-05 renaming changes no assignment (id instead of text)", () => {
  it("location stays assigned to the same zone after the zone is renamed", async () => {
    const z = await call(create(), { name: "Lampe 2", luxCeiling: 15000 });
    if (!z.ok) throw new Error("Create failed");
    const s = await call(locationSetUp(store.locationAdapter()), {
      name: "Regal",
      lightZoneId: z.value.id,
      kind: "indoor",
    });
    await call(lightZoneUpdate(store.zoneAdapter()), {
      id: z.value.id,
      name: "Unterholz",
      luxCeiling: 15000,
    });
    expect(s.ok && store.locations[0]?.lightZoneId).toBe(z.value.id);
    expect(store.locations[0]).toMatchObject({ name: "Regal", lightZoneId: z.value.id });
  });

  it("renaming a location leaves zone and kind untouched", async () => {
    const z = await call(create(), { name: "Lampe 2", luxCeiling: 15000 });
    if (!z.ok) throw new Error("Create failed");
    const s = await call(locationSetUp(store.locationAdapter()), {
      name: "Regal",
      lightZoneId: z.value.id,
      kind: "outdoor",
    });
    if (!s.ok) throw new Error("Create failed");
    const r = await call(locationUpdate(store.locationAdapter()), {
      id: s.value.id,
      name: "Balkonregal",
      lightZoneId: z.value.id,
      kind: "outdoor",
    });
    expect(r.ok && r.value).toMatchObject({
      id: s.value.id,
      name: "Balkonregal",
      lightZoneId: z.value.id,
      kind: "outdoor",
    });
  });
});
