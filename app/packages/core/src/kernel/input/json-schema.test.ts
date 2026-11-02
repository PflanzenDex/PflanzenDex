import { describe, expect, it } from "vitest";
import { jsonSchemaOf } from "./json-schema";
import { choiceField, idField, integerField, orNull, shape, textField } from "./validation";

// US-KI-07: the JSON Schema of a check follows the check (fields, types, limits, required).
describe("US-KI-07 JSON Schema of the input checks", () => {
  it("US-KI-07 a shape lists every field; a field is required exactly when its check refuses a missing value", () => {
    const schema = shape({
      name: textField("name", { min: 1, max: 10 }),
      level: orNull(integerField("level", { min: 2, max: 4 })),
      kind: orNull(choiceField("kind", ["a", "b"] as const)),
      id: idField("id"),
    });
    expect(jsonSchemaOf(schema)).toEqual({
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 10 },
        level: { type: ["integer", "null"], minimum: 2, maximum: 4 },
        kind: { type: ["string", "null"], enum: ["a", "b", null] },
        id: { type: "string", format: "uuid" },
      },
      required: ["name", "id"],
      additionalProperties: false,
    });
  });

  it("US-KI-07 a check without a schema has none", () => {
    expect(jsonSchemaOf(() => null)).toBeNull();
  });
});
