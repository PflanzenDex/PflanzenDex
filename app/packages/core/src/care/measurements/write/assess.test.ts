import { describe, expect, it } from "vitest";
import { execute } from "../../../kernel";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { InMemoryMeasurements } from "../../shared/test-helpers";
import { measurementAssess } from "./assess";

const idempotency = new InMemoryIdempotencyStore();
let counter = 0;
const call = (userId: string, input: unknown) => ({
  context: { userId, timeZone: "Europe/Berlin" },
  input,
  idempotencyKey: `k${++counter}`,
});
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);
const specimens = (status: "plant" | "archived" = "plant") => ({
  find: async (_u: string, id: string) => ({ id, status }) as never,
});

async function setup(photo: string | null, status: "plant" | "archived" = "plant") {
  const measurements = new InMemoryMeasurements({ anna: ["s1"] });
  const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  measurements.rows.push({
    userId: "anna",
    id,
    specimenId: "s1",
    date: "2026-10-10",
    value: 10,
    quality: "healthy",
    note: null,
    ratedBy: "keeper",
    photo,
  });
  return {
    measurements,
    id,
    op: measurementAssess({ measurements, specimens: specimens(status) }),
  };
}
const MID = "00000000-0000-4000-8000-0000000000ff";

describe("US-KI-04 assess the photo of a measurement", () => {
  it("US-KI-04 sets quality and note and marks an adopted AI suggestion, the value stays", async () => {
    const { measurements, id, op } = await setup("p.jpg");
    const r = await execute(
      op,
      { idempotency },
      call("anna", {
        measurementId: id,
        quality: "etiolated",
        note: "Streckt sich.",
        aiSuggestion: true,
      }),
    );
    expect(code(r)).toBe("ok");
    expect(await measurements.get("anna", id)).toMatchObject({
      quality: "etiolated",
      note: "Streckt sich.",
      ratedBy: "ai_adopted",
      value: 10,
    });
  });

  it("US-KI-04 without the AI flag it is the keeper's own assessment", async () => {
    const { measurements, id, op } = await setup("p.jpg");
    await execute(op, { idempotency }, call("anna", { measurementId: id, quality: "etiolated" }));
    expect(await measurements.get("anna", id)).toMatchObject({ ratedBy: "keeper", note: null });
  });

  it("US-KI-04 refuses an impossible quality, a photoless measurement and an archived specimen", async () => {
    const a = await setup("p.jpg");
    expect(
      code(
        await execute(
          a.op,
          { idempotency },
          call("anna", { measurementId: a.id, quality: "great" }),
        ),
      ),
    ).toBe("input.invalid");
    const b = await setup(null);
    expect(
      code(
        await execute(
          b.op,
          { idempotency },
          call("anna", { measurementId: b.id, quality: "etiolated" }),
        ),
      ),
    ).toBe("measurement.photo_not_found");
    const c = await setup("p.jpg", "archived");
    expect(
      code(
        await execute(
          c.op,
          { idempotency },
          call("anna", { measurementId: c.id, quality: "etiolated" }),
        ),
      ),
    ).toBe("specimen.archived");
  });

  it("US-KI-04 a foreign or unknown measurement looks the same and nothing is written (P-04)", async () => {
    const { measurements, id, op } = await setup("p.jpg");
    expect(
      code(
        await execute(
          op,
          { idempotency },
          call("ben", { measurementId: id, quality: "etiolated" }),
        ),
      ),
    ).toBe("measurement.not_found");
    expect(
      code(
        await execute(
          op,
          { idempotency },
          call("anna", { measurementId: MID, quality: "etiolated" }),
        ),
      ),
    ).toBe("measurement.not_found");
    expect((await measurements.get("anna", id))?.quality).toBe("healthy");
  });
});
