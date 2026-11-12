import { jsonSchemaOf } from "@pflanzendex/core";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { draftTypes } from "../../drafts/draft-types";
import { DRAFT_CONTENTS } from "./draft-content";
import { describeTool, MCP_TOOLS } from "./index";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// US-KI-07: tools/list shows every field of every draft type, derived from the check of the operation, so a client
// finds the optional fields (light level, dormancy, ...) without guessing from error messages.
const listed = () => {
  const t = MCP_TOOLS.find((x) => x.name === "propose_draft");
  if (!t) throw new Error("no propose_draft");
  const content = (describeTool(t).inputSchema as Json)["properties"].content as Json;
  return Object.fromEntries((content["anyOf"] as Json[]).map((b) => [b["title"], b])) as Record<
    string,
    Json
  >;
};

describe("US-KI-07 MCP draft schemas list every field", () => {
  it("US-KI-07 every draft type the interface accepts has a content branch in propose_draft", () => {
    // The drafts of the write tools (US-KI-14) arrive through those tools, not through propose_draft.
    const accepted = Object.keys(
      draftTypes({} as Pool, { schema: () => null } as never, {} as never),
    );
    expect(Object.keys(listed()).sort()).toEqual(accepted.sort());
  });

  it("US-KI-07 every field of the core check is in the tool's schema with a type and a description", () => {
    for (const [type, c] of Object.entries(DRAFT_CONTENTS)) {
      const core = jsonSchemaOf(c.schema) as Json;
      const branch = listed()[type] as Json;
      const hidden = new Set(c.serverSet ?? []);
      for (const field of Object.keys(core["properties"]).filter((f) => !hidden.has(f))) {
        const p = branch["properties"][field] as Json | undefined;
        expect(p, `${type}.${field} missing in tools/list`).toBeDefined();
        expect(p?.["type"], `${type}.${field} has no type`).toBeDefined();
        expect(p?.["description"], `${type}.${field} has no description`).toEqual(
          expect.any(String),
        );
      }
      for (const field of hidden) expect(branch["properties"][field]).toBeUndefined();
    }
  });

  it("US-KI-07 the species branch lists the optional fields with their limits; only the form's required ones are required", () => {
    const species = listed()["species"] as Json;
    expect(species["required"]).toEqual([
      "latinName",
      "growthMeasure",
      "etiolationSigns",
      "successCriteria",
      "source",
    ]);
    expect(species["properties"]).toMatchObject({
      standardLevel: { type: ["integer", "null"], minimum: 2, maximum: 4 },
      lightDemandLux: { type: ["integer", "null"], minimum: 1, maximum: 200000 },
      dormancyFrom: { type: ["string", "null"], pattern: "^\\d\\d-\\d\\d$" },
      dormancyUntil: { type: ["string", "null"] },
      softLeaf: { type: ["boolean", "null"] },
      difficulty: { type: ["integer", "null"], minimum: 1, maximum: 3 },
      growthMeasure: { type: "string", enum: ["height", "rosette_diameter", "shoot_length"] },
      synonyms: { type: ["array", "null"], maxItems: 20 },
      germanName: { type: ["string", "null"], maxLength: 120 },
    });
  });

  it("US-KI-07 the other draft types list their optional fields too", () => {
    const { wish, photo_assessment, discover_decision } = listed() as Record<string, Json>;
    expect(wish?.["required"]).toEqual(["name"]);
    expect(Object.keys(wish?.["properties"])).toEqual(
      expect.arrayContaining(["german", "targetZoneId", "difficulty", "imageUrl", "license"]),
    );
    expect(photo_assessment?.["required"]).toEqual(["measurementId", "quality"]);
    expect(photo_assessment?.["properties"]).toMatchObject({
      quality: { enum: ["healthy", "etiolated"] },
      note: { type: ["string", "null"] },
    });
    expect(discover_decision?.["properties"]).toMatchObject({
      decision: { enum: ["yes", "no", "later"] },
    });
  });
});
