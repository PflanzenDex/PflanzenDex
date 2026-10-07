import { describe, expect, it } from "vitest";
import { refusedFields } from "./schemas";

describe("US-POK-02 refusal of a hybrid sign or addition lands on the Latin name field", () => {
  it("shows the German text of the detail code on latinName", () => {
    const fields = refusedFields({
      code: "input.invalid",
      details: [{ field: "latinName", code: "catalog.name_hybrid" }],
    });
    expect(fields).toHaveLength(1);
    expect(fields[0]?.field).toBe("latinName");
    expect(fields[0]?.message).toContain("Hybridzeichen");
  });
});
