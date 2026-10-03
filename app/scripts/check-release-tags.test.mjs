import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReleaseTags } from "./check-release-tags.mjs";

const bot = "github-actions[bot]";
const base = {
  tags: [
    { name: "v0.0.0", sha: "aaaaaaa1" },
    { name: "v0.1.0", sha: "bbbbbbb2" },
  ],
  releases: [{ tag: "v0.1.0", author: bot }],
  onMain: () => true,
  packageJsons: { "app/package.json": { name: "x" } },
};

test("FR-DEV-05: seed tag plus bot-released tags on main pass", () => {
  assert.deepEqual(checkReleaseTags(base), []);
});

test("FR-DEV-05: a tag without a GitHub release is reported", () => {
  const p = checkReleaseTags({ ...base, releases: [] });
  assert.match(p.join(), /v0\.1\.0: no GitHub release/);
});

test("FR-DEV-05: a release by a human is reported", () => {
  const p = checkReleaseTags({ ...base, releases: [{ tag: "v0.1.0", author: "konrad" }] });
  assert.match(p.join(), /created by konrad/);
});

test("FR-DEV-05: a non-SemVer tag is reported", () => {
  const p = checkReleaseTags({
    ...base,
    tags: [{ name: "v1.0", sha: "ccccccc3" }],
    releases: [{ tag: "v1.0", author: bot }],
  });
  assert.match(p.join(), /v1\.0: tag is not SemVer/);
});

test("FR-DEV-05: a tag off main is reported", () => {
  const p = checkReleaseTags({ ...base, onMain: (sha) => sha !== "bbbbbbb2" });
  assert.match(p.join(), /v0\.1\.0: tag points at bbbbbbb, which is not on main/);
});

test("FR-DEV-05: a hand-written version field is reported", () => {
  const p = checkReleaseTags({
    ...base,
    packageJsons: { "app/package.json": { version: "1.2.3" } },
  });
  assert.match(p.join(), /app\/package\.json: has a "version" field/);
});
