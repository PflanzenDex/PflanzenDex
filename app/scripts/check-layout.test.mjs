import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import config from "../layout.config.mjs";
import { compareBaseline } from "./layout-baseline.mjs";
import { findLayout } from "./layout-rules.mjs";
import { BASELINE_FILE, listPaths } from "./check-layout.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });

describe("US-QG-09 listPaths", () => {
  it("lists tracked and new files unquoted and skips files deleted in the working tree", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-"));
    try {
      git(dir, "init", "-q");
      for (const f of ["größe.md", "a b.md", "gone.md"]) fs.writeFileSync(path.join(dir, f), "");
      git(dir, "add", "-A");
      git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x");
      fs.rmSync(path.join(dir, "gone.md"));
      fs.writeFileSync(path.join(dir, "new.md"), "");
      assert.deepEqual(listPaths(dir).sort(), ["a b.md", "größe.md", "new.md"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("US-QG-09 the repo", () => {
  it("passes the layout check with its own baseline", () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
    assert.deepEqual(compareBaseline(findLayout(listPaths(), config), baseline), []);
  });
});
