// Self-test of the QG-U5 visual regression (US-QS-07): with a fixture story it proves that two runs on an unchanged
// tree produce identical pictures, and that a padding change of 4 px fails the comparison and leaves a diff image.
// It needs Docker, so it is not part of `npm test`; `npm run ds-snapshots` runs it right after the real check.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { expectedPageBaselines } from "./ds-snapshots.lib.mjs";
import { runCatalog } from "./ds-snapshots.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ds-snapshots-selftest-"));
const dirs = (name) => ({
  snapshotDir: path.join(tmp, name, "baselines"),
  pageSnapshotDir: path.join(tmp, name, "page-baselines"),
  outputDir: path.join(tmp, name, "results"),
});
const hashes = (dir) =>
  Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => [
        f,
        createHash("sha256")
          .update(fs.readFileSync(path.join(dir, f)))
          .digest("hex"),
      ]),
  );
const find = (dir, suffix) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true })
        .filter((f) => String(f).endsWith(suffix))
        .map(String)
    : [];

describe("QG-U5 · US-QS-07 · visual regression catches", () => {
  const a = dirs("a");
  const b = dirs("b");

  it("QG-U5 · US-QS-07 · two runs on an unchanged tree produce identical screenshots", () => {
    assert.equal(runCatalog({ fixtures: true, update: true, ...a }).status, 0);
    assert.equal(runCatalog({ fixtures: true, update: true, ...b }).status, 0);
    const first = hashes(a.snapshotDir);
    assert.deepEqual(Object.keys(first).sort(), [
      "ds-snapshot-fixture-padding--default--dark.png",
      "ds-snapshot-fixture-padding--default--light.png",
    ]);
    assert.deepEqual(hashes(b.snapshotDir), first);
  });

  it("QG-U5 · FR-QG-27 · two runs on an unchanged tree produce identical page screenshots at all five sizes", () => {
    const first = hashes(a.pageSnapshotDir);
    assert.deepEqual(
      Object.keys(first).sort(),
      expectedPageBaselines(["ds-snapshot-fixture-page--default"]).sort(),
    );
    assert.deepEqual(hashes(b.pageSnapshotDir), first);
    assert.equal(
      new Set(Object.values(first)).size > 5,
      true,
      "sizes must render different pictures",
    );
  });

  it("QG-U5 · US-QS-07 · the unchanged tree passes the comparison", () => {
    const r = runCatalog({ fixtures: true, ...a, outputDir: b.outputDir });
    assert.equal(r.status, 0);
    assert.deepEqual(r.findings, []);
  });

  it("QG-U5 · US-QS-07 · a primitive whose padding changes by 4 px fails and the diff image is written", () => {
    const out = dirs("c").outputDir;
    const r = runCatalog({
      fixtures: true,
      ...a,
      outputDir: out,
      storyArgs: "padding:16", // the fixture's default is 12
    });
    assert.notEqual(r.status, 0);
    assert.ok(find(out, "-diff.png").length > 0, `no diff image in ${out}`);
    // The page fixture takes the same arg: its pictures differ at a page size too (FR-QG-27) and leave a diff.
    assert.ok(
      find(out, "-diff.png").some((f) => /fixture-page.*\d+x\d+/.test(f)),
      `no page diff image in ${out}`,
    );
  });

  it("QG-U5 · US-QS-07 · a missing baseline is reported", () => {
    const r = runCatalog({
      fixtures: true,
      snapshotDir: path.join(tmp, "empty"),
      pageSnapshotDir: path.join(tmp, "empty-pages"),
      outputDir: b.outputDir,
    });
    assert.notEqual(r.status, 0);
    assert.equal(r.findings.length, 2 + 10); // the new page without baselines fails (FR-QG-27)
  });
});
