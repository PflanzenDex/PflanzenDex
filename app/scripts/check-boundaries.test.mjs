import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  checkProject,
  hasMarker,
  importsOf,
  KNOWN_EXCEPTIONS,
  markersOf,
} from "./check-boundaries.mjs";

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boundaries-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}
const clean = {
  "packages/core/src/index.ts": 'export * from "./meta";\n',
  "packages/core/src/meta/index.ts": 'export { x } from "./x";\n',
  "packages/core/src/meta/x.ts": "export const x = 1;\n",
  "packages/web/src/a.ts": 'import { x } from "@pflanzendex/core";\nexport const y = x;\n',
};

describe("architecture boundaries (US-QG-03)", () => {
  it("a clean project has no violations", () => assert.deepEqual(checkProject(project(clean)), []));

  it("AB-1: core imports a Node module", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/core/src/meta/x.ts": 'import fs from "node:fs";\nexport const x = fs;\n',
      }),
    );
    assert.equal(v.length, 1);
    assert.match(v[0], /^AB-1 packages\/core\/src\/meta\/x\.ts:1 /);
  });
  it("AB-1: core imports a third-party package outside the allowlist", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/core/src/meta/x.ts": 'import { Hono } from "hono";\nexport const x = Hono;\n',
      }),
    );
    assert.match(v[0] ?? "", /^AB-1 .*hono/);
  });
  it("AB-1: core imports another package of the monorepo", () => {
    const v = checkProject(
      project({ ...clean, "packages/core/src/meta/x.ts": 'export * from "@pflanzendex/web";\n' }),
    );
    assert.match(v[0] ?? "", /^AB-1 .*other package/);
  });
  it("AB-1: a relative import leaves core", () => {
    const v = checkProject(
      project({ ...clean, "packages/core/src/meta/x.ts": 'import "../../../api/src/app";\n' }),
    );
    assert.match(v[0] ?? "", /^AB-1 .*leaves core/);
  });
  it("AB-1: test files in core may import vitest, nothing else", () => {
    assert.deepEqual(
      checkProject(
        project({
          ...clean,
          "packages/core/src/meta/x.test.ts": 'import { it } from "vitest";\nit("x", () => {});\n',
        }),
      ),
      [],
    );
    const v = checkProject(
      project({
        ...clean,
        "packages/core/src/meta/x.test.ts": 'import fs from "node:fs";\nexport default fs;\n',
      }),
    );
    assert.match(v[0] ?? "", /^AB-1 /);
  });
  it("AB-2: deep import into core from web or API", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/api/src/a.ts":
          'import { x } from "@pflanzendex/core/src/meta/x";\nexport const y = x;\n',
      }),
    );
    assert.match(v[0] ?? "", /^AB-2 packages\/api\/src\/a\.ts:1 /);
  });
  it("AB-2: a relative import reaches into core", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/web/src/a.ts":
          'import { x } from "../../core/src/meta/x";\nexport const y = x;\n',
      }),
    );
    assert.match(v[0] ?? "", /^AB-2 /);
  });
  it("ST-c: directory with code but without index.ts", () => {
    const v = checkProject(
      project({ ...clean, "packages/core/src/plan/regel.ts": "export const r = 1;\n" }),
    );
    assert.deepEqual(v, [
      "ST-c packages/core/src/plan/index.ts missing: every directory with code needs an index.ts as its public interface",
    ]);
  });
  it("ST-c: a directory with only test files needs no index.ts", () => {
    assert.deepEqual(
      checkProject(
        project({
          ...clean,
          "packages/core/src/plan/regel.test.ts":
            'import { it } from "vitest";\nit("x", () => {});\n',
        }),
      ),
      [],
    );
  });
  it("comments containing import text trigger no violation", () => {
    assert.deepEqual(
      checkProject(
        project({
          ...clean,
          "packages/core/src/meta/x.ts":
            '// import fs from "node:fs";\n/* import "hono"; */\nexport const x = 1;\n',
        }),
      ),
      [],
    );
  });
  it("detects dynamic and require imports", () => {
    assert.deepEqual(
      importsOf(
        'const a = await import("a");\nconst b = require("b");\nimport "c";\nexport * from "d";',
      )
        .map((i) => i.spec)
        .sort(),
      ["a", "b", "c", "d"],
    );
  });

  it("AB-6: web imports API or database", () => {
    for (const spec of ["@pflanzendex/api", "@pflanzendex/db"]) {
      const v = checkProject(
        project({
          ...clean,
          "packages/web/src/b.ts": `import { z } from "${spec}";\nexport { z };\n`,
        }),
      );
      assert.match(v[0] ?? "", /^AB-6 packages\/web\/src\/b\.ts:1 /);
    }
  });
  it("MK-1: a marker without a reason is an error, with a reason it is not", () => {
    const v = checkProject(
      project({ ...clean, "packages/api/src/m.ts": "// MAX_LINES_IGNORE:\nexport const m = 1;\n" }),
    );
    assert.match(v[0] ?? "", /^MK-1 packages\/api\/src\/m\.ts:1 /);
    assert.deepEqual(
      checkProject(
        project({
          ...clean,
          "packages/api/src/m.ts": "// MAX_LINES_IGNORE: generated file\nexport const m = 1;\n",
        }),
      ),
      [],
    );
  });
<<<<<<< HEAD
  it("a marker only counts in the first 5 lines", () => {
=======
  it("MK-1: COMPLEXITY_IGNORE needs a reason too", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/api/src/m.ts": "// COMPLEXITY_IGNORE:\nexport const m = 1;\n",
      }),
    );
    assert.match(v[0] ?? "", /^MK-1 packages\/api\/src\/m\.ts:1 /);
    assert.equal(hasMarker("// COMPLEXITY_IGNORE: parser table\n", "COMPLEXITY_IGNORE"), true);
  });
  it("Marker gilt nur in den ersten 5 Zeilen", () => {
>>>>>>> refs/remotes/origin/dev
    assert.equal(hasMarker("\n\n\n\n\n// STRUCTURE_IGNORE: x\n", "STRUCTURE_IGNORE"), false);
    assert.deepEqual(markersOf("/* STRUCTURE_IGNORE: legacy */\n"), [
      { name: "STRUCTURE_IGNORE", reason: "legacy" },
    ]);
  });
  it("ST-c: STRUCTURE_IGNORE with a reason exempts the file", () => {
    assert.deepEqual(
      checkProject(
        project({
          ...clean,
          "packages/core/src/plan/regel.ts": "// STRUCTURE_IGNORE: legacy\nexport const r = 1;\n",
        }),
      ),
      [],
    );
  });
  it("EX-1: the project exception list only has entries with a reason", () => {
    assert.ok(KNOWN_EXCEPTIONS.every((e) => e.reason?.trim()));
  });
});
