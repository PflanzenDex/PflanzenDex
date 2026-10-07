import { beforeEach, describe, expect, it } from "vitest";
import { measurementSource } from "../../index";
import { InMemoryMeasurements } from "../../shared/test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const E3 = "00000000-0000-4000-8000-000000000003";

let store: InMemoryMeasurements;
const values = (specimenId: string, extra: Record<string, unknown> = {}) => ({
  specimenId,
  date: "2026-10-01",
  value: 12.5,
  quality: "healthy" as const,
  note: null,
  ratedBy: "keeper" as const,
  ...extra,
});

beforeEach(() => {
  store = new InMemoryMeasurements({ anna: [E1, E2, E3], ben: ["b1"] });
});

describe("US-WAC-01 MeasurementSource for the specimen cards (US-BES-06)", () => {
  it("names the last measurement per specimen with value, date, quality and note", async () => {
    await store.create("anna", values(E1, { date: "2026-09-20", value: 10 }));
    await store.create(
      "anna",
      values(E1, { date: "2026-10-02", value: 14, quality: "etiolated", note: "stretched" }),
    );
    const r = await measurementSource({ measurements: store }).forSpecimens("anna", [E1]);
    expect(r.get(E1)?.last).toEqual({
      date: "2026-10-02",
      value: 14,
      quality: "etiolated",
      note: "stretched",
    });
  });

  it("with the same date the measurement recorded last counts", async () => {
    await store.create("anna", values(E1, { value: 11 }));
    await store.create("anna", values(E1, { value: 11.5 }));
    const r = await measurementSource({ measurements: store }).forSpecimens("anna", [E1]);
    expect(r.get(E1)?.last.value).toBe(11.5);
  });

  it("a specimen without a measurement is missing from the answer (unknown, P-08)", async () => {
    await store.create("anna", values(E1));
    const r = await measurementSource({ measurements: store }).forSpecimens("anna", [E1, E2]);
    expect([...r.keys()]).toEqual([E1]);
  });

  it("the photo is null while no measurement has one, never an invented value", async () => {
    await store.create("anna", values(E1));
    const r = await measurementSource({ measurements: store }).forSpecimens("anna", [E1]);
    expect(r.get(E1)?.photo).toBeNull();
  });

  it("US-WAC-05 the photo is the most recent one, even if the last measurement has none; its url is the private API path", async () => {
    const old = await store.create("anna", values(E1, { date: "2026-09-20" }));
    await store.create("anna", values(E1, { date: "2026-10-02" }));
    if (typeof old === "string") throw new Error(old);
    await store.setPhoto("anna", old.id, "p1.jpg");
    const r = await measurementSource({ measurements: store }).forSpecimens("anna", [E1]);
    expect(r.get(E1)?.photo).toEqual({
      url: `/specimens/${E1}/measurements/${old.id}/photo`,
      date: "2026-09-20",
    });
    expect(r.get(E1)?.last.date).toBe("2026-10-02");
  });

  it("US-WAC-05 of two photos the newer measurement wins", async () => {
    const a = await store.create("anna", values(E1, { date: "2026-09-20" }));
    const b = await store.create("anna", values(E1, { date: "2026-10-02" }));
    if (typeof a === "string" || typeof b === "string") throw new Error("fixture");
    await store.setPhoto("anna", a.id, "p1.jpg");
    await store.setPhoto("anna", b.id, "p2.jpg");
    const r = await measurementSource({ measurements: store }).forSpecimens("anna", [E1]);
    expect(r.get(E1)?.photo?.date).toBe("2026-10-02");
  });

  it("tenant: measurements of another account do not appear", async () => {
    await store.create("ben", values("b1"));
    const r = await measurementSource({ measurements: store }).forSpecimens("anna", ["b1"]);
    expect(r.size).toBe(0);
  });

  it("without IDs it does not ask the store", async () => {
    let asked = 0;
    const source = measurementSource({
      measurements: {
        lastFor: async () => {
          asked += 1;
          return new Map();
        },
        lastPhotoFor: async () => {
          asked += 1;
          return new Map();
        },
      },
    });
    expect((await source.forSpecimens("anna", [])).size).toBe(0);
    expect(asked).toBe(0);
  });
});
