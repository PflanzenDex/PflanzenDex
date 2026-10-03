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

describe("Architekturgrenzen (US-QG-03)", () => {
  it("sauberes Projekt hat keine Verstöße", () =>
    assert.deepEqual(checkProject(project(clean)), []));

  it("AB-1: core importiert ein Node-Modul", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/core/src/meta/x.ts": 'import fs from "node:fs";\nexport const x = fs;\n',
      }),
    );
    assert.equal(v.length, 1);
    assert.match(v[0], /^AB-1 packages\/core\/src\/meta\/x\.ts:1 /);
  });
  it("AB-1: core importiert ein Fremdpaket außerhalb der Allowlist", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/core/src/meta/x.ts": 'import { Hono } from "hono";\nexport const x = Hono;\n',
      }),
    );
    assert.match(v[0] ?? "", /^AB-1 .*hono/);
  });
  it("AB-1: core importiert ein anderes Paket des Monorepos", () => {
    const v = checkProject(
      project({ ...clean, "packages/core/src/meta/x.ts": 'export * from "@pflanzendex/web";\n' }),
    );
    assert.match(v[0] ?? "", /^AB-1 .*anderes Paket/);
  });
  it("AB-1: relativer Import verlässt core", () => {
    const v = checkProject(
      project({ ...clean, "packages/core/src/meta/x.ts": 'import "../../../api/src/app";\n' }),
    );
    assert.match(v[0] ?? "", /^AB-1 .*verlässt core/);
  });
  it("AB-1: Testdateien in core dürfen vitest importieren, sonst nichts", () => {
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
  it("AB-2: tiefer Import in core aus Web oder API", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/api/src/a.ts":
          'import { x } from "@pflanzendex/core/src/meta/x";\nexport const y = x;\n',
      }),
    );
    assert.match(v[0] ?? "", /^AB-2 packages\/api\/src\/a\.ts:1 /);
  });
  it("AB-2: relativer Import greift in core hinein", () => {
    const v = checkProject(
      project({
        ...clean,
        "packages/web/src/a.ts":
          'import { x } from "../../core/src/meta/x";\nexport const y = x;\n',
      }),
    );
    assert.match(v[0] ?? "", /^AB-2 /);
  });
  it("ST-c: Verzeichnis mit Code ohne index.ts", () => {
    const v = checkProject(
      project({ ...clean, "packages/core/src/plan/regel.ts": "export const r = 1;\n" }),
    );
    assert.deepEqual(v, [
      "ST-c packages/core/src/plan/index.ts fehlt: jedes Verzeichnis mit Code braucht einen index.ts als öffentliche Schnittstelle",
    ]);
  });
  it("ST-c: Verzeichnis nur mit Testdateien braucht keinen index.ts", () => {
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
  it("Kommentare mit Import-Text lösen keinen Verstoß aus", () => {
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
  it("erkennt dynamische und require-Importe", () => {
    assert.deepEqual(
      importsOf(
        'const a = await import("a");\nconst b = require("b");\nimport "c";\nexport * from "d";',
      )
        .map((i) => i.spec)
        .sort(),
      ["a", "b", "c", "d"],
    );
  });

  it("AB-6: Web importiert API oder Datenbank", () => {
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
  it("MK-1: Marker ohne Grund ist ein Fehler, mit Grund nicht", () => {
    const v = checkProject(
      project({ ...clean, "packages/api/src/m.ts": "// MAX_LINES_IGNORE:\nexport const m = 1;\n" }),
    );
    assert.match(v[0] ?? "", /^MK-1 packages\/api\/src\/m\.ts:1 /);
    assert.deepEqual(
      checkProject(
        project({
          ...clean,
          "packages/api/src/m.ts": "// MAX_LINES_IGNORE: generierte Datei\nexport const m = 1;\n",
        }),
      ),
      [],
    );
  });
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
    assert.equal(hasMarker("\n\n\n\n\n// STRUCTURE_IGNORE: x\n", "STRUCTURE_IGNORE"), false);
    assert.deepEqual(markersOf("/* STRUCTURE_IGNORE: Altlast */\n"), [
      { name: "STRUCTURE_IGNORE", reason: "Altlast" },
    ]);
  });
  it("ST-c: STRUCTURE_IGNORE mit Grund nimmt die Datei aus", () => {
    assert.deepEqual(
      checkProject(
        project({
          ...clean,
          "packages/core/src/plan/regel.ts": "// STRUCTURE_IGNORE: Altlast\nexport const r = 1;\n",
        }),
      ),
      [],
    );
  });
  it("EX-1: Ausnahmeliste des Projekts enthält nur Einträge mit Grund", () => {
    assert.ok(KNOWN_EXCEPTIONS.every((e) => e.reason?.trim()));
  });
});
