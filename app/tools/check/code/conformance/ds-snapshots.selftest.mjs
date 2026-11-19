// Self-test of the QG-U5 visual regression (US-QS-07): with a fixture story it proves that two runs on an unchanged
// tree produce identical pictures, and that a padding change of 4 px fails the comparison and leaves a diff image.
// It needs Docker, so it is not part of `npm test`; `npm run ds-snapshots` runs it right after the real check.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { expectedBaselines, expectedPageBaselines } from "./ds-snapshots.lib.mjs";
import { resultsDir, runCatalog, scratchDir } from "./ds-snapshots.mjs";

// Under app/.cache, not os.tmpdir(): the fixture folders are mounted into the container (issue 2286).
const tmp = scratchDir("ds-snapshots-selftest-");
// The fixture folder is removed after the file, also when a test fails (#1278).
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
// app/.cache, the scratch root of the check (issue 2286): the catalog and the staging folders live in it.
const cacheRoot = path.dirname(resultsDir);
const stagingDirs = () =>
  fs.existsSync(cacheRoot)
    ? fs.readdirSync(cacheRoot).filter((f) => f.startsWith("ds-snapshots-staging-"))
    : [];
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

describe("QG-U5 · US-QS-07 · the catalog and a failed update (#2286)", () => {
  it("QG-U5 · US-QS-07 · the catalog is built under app/.cache, which Docker can mount on every host (#2286)", () => {
    // docker: "false" stands in for the container run; only the catalog build is under test here.
    const r = runCatalog({ fixtures: true, docker: "false", ...dirs("location") });
    assert.ok(r.catalog, "runCatalog returns the catalog it built");
    assert.ok(
      path.resolve(r.catalog).startsWith(cacheRoot + path.sep),
      `${r.catalog} is outside ${cacheRoot}`,
    );
  });

  it("QG-U5 · US-QS-07 · a failed --update leaves the baselines untouched (#2286)", () => {
    // The baselines are written here, not copied from the first test: its screenshots need a working container.
    const c = dirs("failed-update");
    const uiNames = expectedBaselines(["ds-snapshot-fixture-padding--default"]);
    const pageNames = expectedPageBaselines(["ds-snapshot-fixture-page--default"]);
    fs.mkdirSync(c.snapshotDir, { recursive: true });
    fs.mkdirSync(c.pageSnapshotDir, { recursive: true });
    uiNames.forEach((f, i) => fs.writeFileSync(path.join(c.snapshotDir, f), `ui-${i}`));
    pageNames.forEach((f, i) => fs.writeFileSync(path.join(c.pageSnapshotDir, f), `page-${i}`));
    const ui = hashes(c.snapshotDir);
    const pages = hashes(c.pageSnapshotDir);
    assert.equal(Object.keys(ui).length, 2);
    assert.equal(Object.keys(pages).length, 10);
    const staging = stagingDirs();
    // docker: "false" exits 1 like a failing `docker run`: the update must not have touched the baselines.
    const r = runCatalog({ fixtures: true, update: true, docker: "false", ...c });
    assert.notEqual(r.status, 0);
    assert.deepEqual(hashes(c.snapshotDir), ui);
    assert.deepEqual(hashes(c.pageSnapshotDir), pages);
    assert.deepEqual(stagingDirs(), staging, "the staging folders are removed after the run");
  });
});
