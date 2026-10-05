// Self-test of the QG-U5 conformance run (US-QS-07): it builds the catalog together with two negative
// fixture stories and proves the run fails on a 36 px target and on an unlabeled input. It needs a
// browser, so it is not part of `npm test`; `npm run conformance` runs it right after the real run.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { runConformance } from "./check-conformance.mjs";

describe("QG-U5 · conformance run catches", () => {
  const outDir = path.join(os.tmpdir(), `conformance-fixtures-${process.pid}`);
  let findings;

  it("QG-U5 · conformance run catches a 36px target and an unlabeled input in the fixture stories", async () => {
    findings = await runConformance({ outDir, fixtures: true });
    assert.ok(findings.length > 0);
  });

  it("QG-U5 · conformance run catches a 36px target, naming story and element", () => {
    const hit = findings.filter((f) => /conformance-fixture-smalltarget--default/.test(f));
    assert.ok(
      hit.some((f) => /button.*36 px.*DS-15/.test(f)),
      hit.join("\n"),
    );
  });

  it("QG-U5 · conformance run catches an unlabeled input through axe, in light and dark", () => {
    for (const scheme of ["light", "dark"]) {
      const hit = findings.filter(
        (f) =>
          f.includes(`conformance-fixture-unlabeledinput--default (${scheme})`) &&
          f.includes("axe label"),
      );
      assert.equal(hit.length, 1, `${scheme}: ${findings.join("\n")}`);
    }
  });

  it("QG-U5 · conformance run reports only the fixture stories, never the catalog", () => {
    assert.ok(
      findings.every((f) => /conformance-fixture/.test(f)),
      findings.join("\n"),
    );
  });
});
