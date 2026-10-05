import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverageByModule, moduleOfPath, storiesByModule } from "./module-report.mjs";

const MODULES = [
  { name: "light", epics: ["LIC"] },
  { name: "catalog", epics: ["BES"] },
  { name: "collection", epics: ["BES"] },
];

describe("module report (FR-QG-19, report only)", () => {
  it("maps a path to its module and ignores root and unmoduled files", () => {
    assert.equal(moduleOfPath("/x/app/packages/core/src/light/zones.ts", MODULES), "light");
    assert.equal(moduleOfPath("packages/db/src/index.ts", MODULES), null);
    assert.equal(moduleOfPath("packages/web/src/lib/utils.ts", MODULES), null);
  });

  it("sums line coverage per module over all packages", () => {
    const c = (total, covered) => ({ lines: { total, covered } });
    const out = coverageByModule(
      {
        core: { total: c(99, 99), "/a/packages/core/src/light/a.ts": c(10, 5) },
        db: { "/a/packages/db/src/light/b.ts": c(10, 10), "/a/packages/db/src/db.ts": c(5, 0) },
      },
      MODULES,
    );
    assert.deepEqual(out, [{ name: "light", lines: 75, total: 20 }]);
  });

  it("counts stories per module and hints at a test outside the modules of the epic", () => {
    const stories = [
      { id: "US-LIC-01", epic: "LIC" },
      { id: "US-BES-02", epic: "BES" },
      { id: "US-ACC-01", epic: "ACC" },
    ];
    const ids = {
      "packages/core/src/light/a.test.ts": new Set(["US-LIC-01", "US-BES-02"]),
      "packages/core/src/collection/b.test.ts": new Set(["US-BES-02"]),
    };
    const out = storiesByModule(stories, ids, MODULES);
    assert.deepEqual(out.counts, [
      ["(no module)", 1],
      ["catalog+collection", 1],
      ["light", 1],
    ]);
    assert.equal(out.hints.length, 1);
    assert.match(out.hints[0], /test in light names US-BES-02, a story of catalog\+collection/);
  });
});
