import { describe, expect, it } from "vitest";
import { toCreateInput } from "./create-input";
import type { CreateFields } from "../model/schemas";

const fields = (extra: Partial<CreateFields> = {}): CreateFields => ({
  marker: "",
  answers: {},
  cutting: false,
  locationId: "",
  catchDate: "2026-10-08",
  ...extra,
});

describe("FR-BES-04 · #306 the catch date is sent only when the keeper changed it", () => {
  it("FR-BES-04 an untouched preset sends no date, also when the form stayed open past local midnight", () => {
    // Preset was 2026-10-08, it is now 2026-10-09: the untouched field must not send yesterday as an explicit date.
    expect(toCreateInput(fields(), [], false)).not.toHaveProperty("catchDate");
  });

  it("FR-BES-04 a date the keeper chose is sent as the catch date", () => {
    expect(toCreateInput(fields({ catchDate: "2025-03-01" }), [], true)).toMatchObject({
      catchDate: "2025-03-01",
    });
  });

  it("FR-BES-04 an emptied field sends no date (unknown stays unknown, P-08)", () => {
    expect(toCreateInput(fields({ catchDate: "" }), [], true)).not.toHaveProperty("catchDate");
  });
});
