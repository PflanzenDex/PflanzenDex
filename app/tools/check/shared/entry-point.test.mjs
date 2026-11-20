// The entry-point helper (US-QG-02, issue 2290): a script is its entry point when Node started it, also through a symlinked path.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { isEntryPoint } from "./entry-point.mjs";

const HELPER_URL = pathToFileURL(fileURLToPath(new URL("./entry-point.mjs", import.meta.url))).href;

/** Runs `fn` with process.argv[1] set to `value` (or with no argv[1] at all), and restores the arguments afterwards. */
function withArgv1(value, fn) {
  const saved = process.argv.slice();
  if (value === undefined) process.argv.length = 1;
  else process.argv[1] = value;
  try {
    return fn();
  } finally {
    process.argv.splice(0, process.argv.length, ...saved);
  }
}

test("US-QG-02: the script that is run is its entry point, also when argv[1] is its own path", () => {
  const self = fileURLToPath(import.meta.url);
  assert.equal(
    withArgv1(self, () => isEntryPoint(import.meta.url)),
    true,
  );
  assert.equal(
    withArgv1(path.join(path.dirname(self), "entry-point.mjs"), () =>
      isEntryPoint(import.meta.url),
    ),
    false,
    "another file is not the entry point",
  );
});

test("US-QG-02: a script started through a symlinked path is its entry point and runs its main", (t) => {
  // The tree is built from the real temporary folder (macOS: /var is a link to /private/var); the script is started
  // through a link to that tree. Node keeps the link in argv[1] but resolves it in import.meta.url.
  const real = fs.realpathSync(os.tmpdir());
  const tree = fs.mkdtempSync(path.join(real, "entry-point-"));
  const link = `${tree}-link`;
  t.after(() => {
    fs.rmSync(link, { force: true });
    fs.rmSync(tree, { recursive: true, force: true });
  });
  fs.symlinkSync(tree, link, "dir");
  const script = path.join(tree, "probe.mjs");
  fs.writeFileSync(
    script,
    `import { isEntryPoint } from ${JSON.stringify(HELPER_URL)};\nconsole.log(String(isEntryPoint(import.meta.url)));\n`,
  );
  const runVia = (file) =>
    spawnSync(process.execPath, [file], { cwd: real, encoding: "utf8" }).stdout.trim();
  assert.equal(runVia(script), "true", "the direct path");
  assert.equal(runVia(path.join(link, "probe.mjs")), "true", "the symlinked path");
});

test("US-QG-02: a missing or unreadable argv[1] is not an entry point, and the helper does not throw", () => {
  assert.equal(
    withArgv1(undefined, () => isEntryPoint(import.meta.url)),
    false,
    "no argv[1], as with node -e",
  );
  assert.equal(
    withArgv1("-", () => isEntryPoint(import.meta.url)),
    false,
    "node - reads from stdin: nothing to compare",
  );
  assert.equal(
    withArgv1(path.join(os.tmpdir(), "no-such-file-2290.mjs"), () => isEntryPoint(import.meta.url)),
    false,
  );
});
