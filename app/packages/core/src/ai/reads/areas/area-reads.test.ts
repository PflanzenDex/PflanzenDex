import { describe, expect, it } from "vitest";
import { ok, type Result } from "../../../kernel";
import { AI_OPERATION_CLASSES, mayCall } from "../../rights";
import { InMemoryAiLog } from "../../test-helpers";
import type { CollectionReadSource, SpecimenItem } from "../types";
import { aiAreaRead, aiNotReleased } from "./area-reads";
import { AREA_NAMES, NOT_RELEASED_CALLS, type AreaQuery, type AreaReadSource } from "./area-source";

const now = new Date("2026-11-02T08:00:00Z");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const specimen = (n: number, name: string): SpecimenItem => ({
  id: uuid(n),
  name,
  speciesId: uuid(90),
  speciesName: "Echte Aloe",
  marker: null,
  status: "plant",
  location: null,
  lightZone: null,
  lightZoneSource: null,
  caughtAt: null,
  archivedAt: null,
});

/** Anna owns three phases and one specimen; Bernd owns nothing (P-04: the fake answers per account). */
function fakes() {
  const queries: AreaQuery[] = [];
  const answer =
    (value: (userId: string, q: AreaQuery) => object) =>
    async (userId: string, q: AreaQuery): Promise<Result<object>> => {
      queries.push(q);
      return ok(value(userId, q));
    };
  const phases = (u: string) => ({
    phases: u === "anna" ? [1, 2, 3].map((n) => ({ specimenId: uuid(n), name: `P${n}` })) : [],
  });
  const areas = Object.fromEntries(
    AREA_NAMES.map((n) => [n, answer(() => ({ unknownValue: null }))]),
  ) as Record<string, unknown>;
  areas["list_care_phases"] = answer(phases);
  areas["get_growth_records"] = answer((_, q) => ({ specimenId: q.specimenId, records: null }));
  const source = {
    specimens: async (u: string) => (u === "anna" ? [specimen(1, "Echte Aloe – blau")] : []),
  } as unknown as CollectionReadSource;
  return { areas: areas as AreaReadSource, source, log: new InMemoryAiLog(), queries };
}
const call = (userId: string, input: unknown, rights: "read" | "drafts" = "read") => ({
  userId,
  connectionId: uuid(77),
  rights,
  input,
  now,
});

describe("US-KI-12 every other area through the AI client", () => {
  it("US-KI-12 a list area answers the app's list paged with total and nextOffset, free texts named as data", async () => {
    const deps = fakes();
    const r = await aiAreaRead("list_care_phases")(
      deps,
      call("anna", { timeZone: "Europe/Berlin", limit: 2 }),
    );
    expect(r.ok && r.value).toMatchObject({
      items: [{ name: "P1" }, { name: "P2" }],
      total: 3,
      nextOffset: 2,
      dataFields: ["items[].name"],
    });
    expect(deps.queries[0]).toMatchObject({ timeZone: "Europe/Berlin", connectionId: uuid(77) });
  });

  it("US-KI-12 a value the app does not know stays null (P-08), nothing is recomputed", async () => {
    const r = await aiAreaRead("get_reminder_settings")(fakes(), call("anna", {}));
    expect(r.ok && r.value).toEqual({ unknownValue: null, dataFields: [] });
  });

  it("US-KI-12 a time zone is required where the app needs 'today' (NFR-08)", async () => {
    const r = await aiAreaRead("list_care_phases")(fakes(), call("anna", {}));
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });

  it("US-KI-12 a specimen is resolved by name within the account (FR-KI-15)", async () => {
    const deps = fakes();
    const r = await aiAreaRead("get_growth_records")(
      deps,
      call("anna", { specimen: "aloe – blau" }),
    );
    expect(r.ok && r.value).toMatchObject({ specimenId: uuid(1) });
  });

  it("US-KI-12 equipment: the list is paged, the free texts beside it are named by their own path (FR-KI-07)", async () => {
    const deps = fakes();
    const sensors = { sensors: [{ name: "Sensor 1" }], specimens: [{ name: "Aloe" }] };
    (deps.areas as Record<string, unknown>)["list_equipment_sensors"] = async () => ok(sensors);
    const r = await aiAreaRead("list_equipment_sensors")(deps, call("anna", {}));
    expect(r.ok && r.value).toMatchObject({
      items: [{ name: "Sensor 1" }],
      specimens: [{ name: "Aloe" }],
      total: 1,
    });
    const fields = r.ok ? (r.value as { dataFields: string[] }).dataFields : [];
    expect(fields).toEqual(expect.arrayContaining(["items[].name", "specimens[].name"]));
  });

  it("US-KI-12 equipment: every kind, need, check and wish has its read (EQU)", () => {
    for (const name of [
      "list_equipment",
      "list_equipment_lamps",
      "list_equipment_sensors",
      "list_equipment_agents",
      "list_equipment_zones",
      "list_equipment_needs",
      "list_equipment_checks_due",
      "list_equipment_wishes",
      "list_bought_equipment_wishes",
      "list_discarded_equipment_wishes",
    ])
      expect(AREA_NAMES).toContain(name);
  });

  it("US-KI-12 equipment checks due need the keeper's 'today' (NFR-08)", async () => {
    const r = await aiAreaRead("list_equipment_checks_due")(fakes(), call("anna", {}));
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });

  it("US-KI-12 every area read is released as read and logged with a count, never with content (FR-KI-19)", async () => {
    for (const name of AREA_NAMES) expect(AI_OPERATION_CLASSES[name]).toBe("read");
    const deps = fakes();
    await aiAreaRead("list_care_phases")(deps, call("anna", { timeZone: "Europe/Berlin" }));
    expect(deps.log.rows.at(-1)).toMatchObject({
      operation: "list_care_phases",
      effect: "read: 3 of 3 entries",
    });
  });

  it("US-KI-12 friends' data, sharing, offers, swaps and recommendations answer ai.not_released and are logged (FR-KI-10)", async () => {
    const deps = fakes();
    for (const operation of new Set(Object.values(NOT_RELEASED_CALLS))) {
      expect(mayCall("write", operation)).toBe(false);
      const r = await aiNotReleased(deps, call("anna", {}, "drafts"), operation);
      expect(!r.ok && r.error.code).toBe("ai.not_released");
      expect(deps.log.rows.at(-1)).toMatchObject({ operation, effect: "refused: ai.not_released" });
    }
  });
});

describe("US-KI-12 tenant isolation (P-04, FR-KI-23)", () => {
  it("US-KI-12 B sees none of A's rows and cannot name A's specimen", async () => {
    const deps = fakes();
    const list = await aiAreaRead("list_care_phases")(
      deps,
      call("bernd", { timeZone: "Europe/Berlin" }),
    );
    expect(list.ok && list.value).toMatchObject({ items: [], total: 0 });
    for (const ref of ["Echte Aloe – blau", uuid(1)]) {
      const r = await aiAreaRead("get_growth_records")(deps, call("bernd", { specimen: ref }));
      expect(!r.ok && r.error.code).toBe("specimen.not_found");
    }
  });
});
