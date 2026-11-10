import { describe, expect, it } from "vitest";
import { EMPTY_PROPOSAL, refusedFields, toProposalInput } from "./schemas";

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

describe("US-LIC-01 the proposal form carries the soft-leaf flag", () => {
  it("US-LIC-01: Given an empty answer, when the proposal is sent, then the soft leaf is unknown (null), never a false (P-08)", () => {
    expect(toProposalInput({ ...EMPTY_PROPOSAL, latinName: "Ficus" }).softLeaf).toBeNull();
  });

  it("US-LIC-01: Given an explicit Ja or Nein, when the proposal is sent, then it is a boolean", () => {
    expect(toProposalInput({ ...EMPTY_PROPOSAL, softLeaf: "yes" }).softLeaf).toBe(true);
    expect(toProposalInput({ ...EMPTY_PROPOSAL, softLeaf: "no" }).softLeaf).toBe(false);
  });
});
