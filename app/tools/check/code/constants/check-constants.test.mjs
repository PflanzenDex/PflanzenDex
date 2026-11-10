import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import plugin, { createNoEnumLiteral } from "./eslint-constants.mjs";
import { checkConstants, toBaseline } from "./check-constants.mjs";

const DEFINING = path.resolve("packages/core/src/collection/shared/types.ts");
const values = new Map([["cutting", [{ name: "SPECIMEN_STATUS", file: DEFINING }]]]);
const enumPlugin = { rules: { "no-enum-literal": createNoEnumLiteral(values) } };

function lint(code, filename = "app/core/src/x/x.ts") {
  const config = [
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser },
      plugins: { constants: { rules: { ...plugin.rules, ...enumPlugin.rules } } },
      rules: { "constants/no-magic-number": "error", "constants/no-enum-literal": "error" },
    },
  ];
  return new Linter().verify(code, config, { filename: path.resolve(filename) });
}

describe("FR-QG-12 constants/no-magic-number", () => {
  it("FR-QG-12 reports a new inline threshold in core and asks for a named constant", () => {
    const [m, ...rest] = lint("export const f = (n: number) => n > 5;");
    assert.equal(rest.length, 0);
    assert.match(m.message, /Inline number 5.*named constant.*\(FR-QG-12\)/);
    assert.equal(m.line, 1);
  });
  it("FR-QG-12 allows a named const and limit objects", () => {
    assert.deepEqual(
      lint(
        "const LIMIT = 5;\nexport const L = { max: 5 * 60 };\nexport const f = (n: number) => n > LIMIT;",
      ),
      [],
    );
  });
  it("FR-QG-12 allows 0, 1, -1, array indexes and HTTP status codes", () => {
    assert.deepEqual(
      lint(
        "export const f = (a: number[]) => [a[3], a.length > 0, a.length - 1, -1, c.json(x, 404)];",
      ),
      [],
    );
  });
});

describe("FR-QG-12 constants/no-enum-literal", () => {
  it("FR-QG-12 reports an enum value used as a key outside its file and names the constant", () => {
    const m = lint('export const f = (s: string) => s === "cutting";');
    assert.equal(m.length, 1);
    assert.match(
      m[0].message,
      /"cutting" is SPECIMEN_STATUS\[…\] in core\/src\/collection\/shared\/types\.ts/,
    );
    assert.equal(lint('switch (s) { case "cutting": break; }').length, 1);
    assert.equal(lint('export const g = L.includes("cutting");').length, 1);
  });
  it("FR-QG-12 ignores the value in a non-key position and in the defining file", () => {
    assert.deepEqual(lint('console.log("cutting"); export const t = { kind: "cutting" };'), []);
    assert.deepEqual(lint('export const f = (s: string) => s === "cutting";', DEFINING), []);
  });
});

const baseline = (entries) => ({
  maxTotal: entries.reduce((s, e) => s + (e.numbers ?? 0) + (e.enums ?? 0), 0),
  entries,
});
const counts = (o) => new Map(Object.entries(o));

describe("FR-QG-12 checkConstants ratchet (QG-C9)", () => {
  it("FR-QG-12 passes when the counts match the baseline", () => {
    const b = baseline([{ file: "a.ts", numbers: 2, enums: 1 }]);
    assert.deepEqual(checkConstants(counts({ "a.ts": { numbers: 2, enums: 1 } }), b), []);
  });
  it("FR-QG-12 CN-1 fails on growth and on a new file", () => {
    const b = baseline([{ file: "a.ts", numbers: 2 }]);
    assert.match(
      checkConstants(counts({ "a.ts": { numbers: 3, enums: 0 } }), b)[0],
      /^CN-1 a\.ts: 3 numbers.*allows 2/,
    );
    assert.match(
      checkConstants(counts({ "a.ts": { numbers: 2 }, "b.ts": { enums: 1 } }), b)[0],
      /^CN-1 b\.ts: 1 enums/,
    );
  });
  it("FR-QG-12 CN-2 fails on a stale entry", () => {
    const b = baseline([{ file: "a.ts", numbers: 2 }]);
    assert.match(
      checkConstants(counts({ "a.ts": { numbers: 1 } }), b)[0],
      /^CN-2 a\.ts: 1 numbers, lower the entry/,
    );
    assert.match(checkConstants(new Map(), b)[0], /^CN-2 a\.ts: .*remove the entry/);
  });
  it("FR-QG-12 CN-3 fails when the entries exceed maxTotal and toBaseline sums them", () => {
    assert.match(
      checkConstants(counts({ "a.ts": { numbers: 2 } }), {
        maxTotal: 1,
        entries: [{ file: "a.ts", numbers: 2 }],
      })[0],
      /^CN-3/,
    );
    assert.deepEqual(
      toBaseline(counts({ "b.ts": { numbers: 0, enums: 1 }, "a.ts": { numbers: 2, enums: 0 } })),
      {
        maxTotal: 3,
        entries: [
          { file: "a.ts", numbers: 2 },
          { file: "b.ts", enums: 1 },
        ],
      },
    );
  });
});
