import { describe, expect, it } from "vitest";
import { ERROR_TEXTS } from "../../kernel";
import { AI_OPERATION_CLASSES } from "../rights";
import { InMemoryAiLog } from "../test-helpers";
import {
  RULES_VERSION,
  aiCheckSpeciesName,
  aiDescribeRules,
  describeRules,
  type RulesSource,
} from "./rules";

const now = new Date("2026-11-06T08:00:00Z");
// The naming rule and its check are a port (they live in `catalog`, tested there); a fake stands in here.
const NAMING = { field: "latinName", rules: { hybrid: "No hybrid sign." } };
const checkName = (name: string) =>
  name.includes("×")
    ? { valid: false, name, code: "catalog.name_hybrid" }
    : { valid: true, name, normalized: "Ficus benjamina" };
const SCHEMA = { type: "object", properties: {}, additionalProperties: false };
const source: RulesSource = {
  areas: [
    {
      area: "catalog",
      operations: [
        {
          tool: "check_species_name",
          title: "Check a name",
          operation: "check_species_name",
          inputSchema: SCHEMA,
          readOnly: true,
        },
        {
          tool: "propose_draft",
          title: "Deliver a draft",
          operation: "propose_draft",
          inputSchema: SCHEMA,
          readOnly: false,
        },
      ],
    },
  ],
  naming: NAMING,
  checkName,
};
const call = (userId: string, input: unknown = {}, rights: "read" | "drafts" = "read") => ({
  userId,
  connectionId: `c-${userId}`,
  rights,
  now,
  input,
});

describe("US-KI-13 rule discovery (FR-KI-17, FR-KI-03)", () => {
  it("US-KI-13 names class and right of every operation from the one table, plus the operations never released", () => {
    const d = describeRules(source);
    expect(d.areas[0]?.operations.map((o) => [o.tool, o.class, o.right])).toEqual([
      ["check_species_name", "read", "read"],
      ["propose_draft", "draft", "drafts"],
    ]);
    const never = Object.entries(AI_OPERATION_CLASSES).filter(([, c]) => c === "never");
    expect(d.notReleased).toEqual(never.map(([op]) => op));
  });

  it("US-KI-13 lists every error code with its meaning, from ERROR_TEXTS", () => {
    const d = describeRules(source);
    expect(Object.fromEntries(d.errors.codes.map((e) => [e.code, e.meaning]))).toEqual(ERROR_TEXTS);
  });

  it("US-KI-13 carries a version and a revision that changes when a rule changes", () => {
    const d = describeRules(source);
    expect(d.version).toBe(RULES_VERSION);
    expect(d.revision).toMatch(/^[0-9a-f]{8}$/);
    expect(describeRules(source).revision).toBe(d.revision);
    const changed = { ...source, naming: { ...NAMING, field: "other" } };
    expect(describeRules(changed).revision).not.toBe(d.revision);
  });

  it("US-KI-13 the discovery holds no account data: two accounts get the same answer, each call is logged once", async () => {
    const log = new InMemoryAiLog();
    const a = await aiDescribeRules({ rules: source, log }, call("anna"));
    const b = await aiDescribeRules({ rules: source, log }, call("bernd"));
    expect(a.ok && b.ok).toBe(true);
    expect(a).toEqual(b);
    expect(log.rows.map((r) => [r.operation, r.connectionId])).toEqual([
      ["describe_rules", "c-anna"],
      ["describe_rules", "c-bernd"],
    ]);
  });

  it("US-KI-13 the dry name check gives the normal form or the proposal's code, writes nothing but the log", async () => {
    const log = new InMemoryAiLog();
    const deps = { rules: source, log };
    const good = await aiCheckSpeciesName(deps, call("anna", { name: "ficus BENJAMINA" }));
    expect(good.ok && good.value).toMatchObject({ valid: true, normalized: "Ficus benjamina" });
    const bad = await aiCheckSpeciesName(deps, call("anna", { name: "Citrus × limon" }));
    expect(bad.ok && bad.value).toMatchObject({ valid: false, code: "catalog.name_hybrid" });
    expect(log.rows.map((r) => r.effect)).toEqual([
      "read: name valid",
      "read: name refused (catalog.name_hybrid)",
    ]);
  });

  it("US-KI-13 an empty name is refused by the input check", async () => {
    const log = new InMemoryAiLog();
    const r = await aiCheckSpeciesName({ rules: source, log }, call("anna", { name: "" }));
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });
});
