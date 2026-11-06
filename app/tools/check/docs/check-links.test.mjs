import test from "node:test";
import assert from "node:assert";
import { execSync, spawnSync } from "child_process";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// This test sits in app/tools/check/docs/, so the app root is two levels up and the repository root four.
const appRoot = resolve(__dirname, "../../..");
const repoRoot = resolve(__dirname, "../../../..");
const CHECK_SOURCE = join(__dirname, "check-links.mjs");
const SCRIPT_IN_TREE = join("app", "tools", "check", "docs", "check-links.mjs");

// Builds a fixture repository. The script is copied to the place it has in the real tree, so the root it
// computes from its own location is the fixture root. `files` maps paths relative to that root to content.
function fixtureRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "check-links-"));
  mkdirSync(dirname(join(root, SCRIPT_IN_TREE)), { recursive: true });
  copyFileSync(CHECK_SOURCE, join(root, SCRIPT_IN_TREE));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function runCheck(root) {
  return spawnSync(process.execPath, [join(root, SCRIPT_IN_TREE)], { encoding: "utf-8" });
}

// Markdown files under dir, found without the check's walker, so the test does not check the walker with itself.
function markdownUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith(".") ? [] : markdownUnder(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

test("US-QG-04: check-links script reports broken relative links", async () => {
  // This test verifies that the check-links script can be executed
  // and returns successfully (exit code 0) when all links are valid
  try {
    const output = execSync("node tools/check/docs/check-links.mjs", {
      cwd: appRoot,
      encoding: "utf-8",
    });
    assert.ok(output.includes("All relative links are valid"));
  } catch (error) {
    // If the script exits with code 1, it means there are broken links
    // This is expected behavior for the test to fail
    if (error.status === 1) {
      assert.fail(`Broken links found: ${error.stdout}`);
    }
    throw error;
  }
});

test("US-QG-04: check-links script ignores external URLs", async () => {
  // This test verifies that the check-links script correctly ignores
  // external URLs like http://, https://, and mailto: links
  try {
    const output = execSync("node tools/check/docs/check-links.mjs", {
      cwd: appRoot,
      encoding: "utf-8",
    });
    assert.ok(output.includes("All relative links are valid"));
  } catch (error) {
    if (error.status === 1) {
      const output = error.stdout;
      // External URLs should not be in the broken links list
      assert.ok(!output.includes("http://"), "Should not report http:// links");
      assert.ok(!output.includes("https://"), "Should not report https:// links");
      assert.ok(!output.includes("mailto:"), "Should not report mailto: links");
    } else {
      throw error;
    }
  }
});

test("US-QG-04: check-links script ignores anchor-only links", async () => {
  // This test verifies that the check-links script correctly ignores
  // pure anchor links like #section
  try {
    const output = execSync("node tools/check/docs/check-links.mjs", {
      cwd: appRoot,
      encoding: "utf-8",
    });
    assert.ok(output.includes("All relative links are valid"));
  } catch (error) {
    if (error.status === 1) {
      // Anchor-only links should not cause failures
      // This is just a sanity check
      assert.ok(error.status === 1);
    } else {
      throw error;
    }
  }
});

test("US-QG-02: a broken relative link in a docs/ file fails the check", () => {
  const root = fixtureRoot({
    "docs/guides/broken.md": "# Broken\n\nSee [the missing page](./missing.md).\n",
  });
  try {
    const run = runCheck(root);
    assert.strictEqual(
      run.status,
      1,
      `expected exit 1, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
    assert.match(run.stderr, /docs\/guides\/broken\.md:3 \[the missing page\]\(\.\/missing\.md\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-QG-02: a valid relative link in a docs/ file passes the check", () => {
  const root = fixtureRoot({
    "docs/guides/target.md": "# Target\n",
    "docs/guides/linking.md":
      "# Linking\n\nSee [target](./target.md#section), [up](../../CLAUDE.md) and [web](https://example.org).\n",
    "CLAUDE.md": "# Claude\n",
  });
  try {
    const run = runCheck(root);
    assert.strictEqual(
      run.status,
      0,
      `expected exit 0, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
    assert.match(run.stdout, /All relative links are valid/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-QG-02: the real repository run reads docs/ and the root Markdown files", () => {
  // Runs the real script in place. Its success line counts the files it checked; that count must cover every
  // Markdown file of docs/ and of the repository root, with the same exclusions the script applies.
  const run = spawnSync(process.execPath, [CHECK_SOURCE], { encoding: "utf-8" });
  assert.strictEqual(run.status, 0, `${run.stdout}${run.stderr}`);
  const checked = Number(run.stdout.match(/\((\d+) Markdown files checked\)/)?.[1]);
  const notChecked = (path) =>
    /\/docs\/records\/(spikes|test-logs)\//.test(path) || path.endsWith("/docs/guides/roadmap.md");
  const expected =
    markdownUnder(join(repoRoot, "docs")).filter((path) => !notChecked(path)).length +
    readdirSync(repoRoot).filter((file) => file.endsWith(".md")).length;
  assert.ok(
    checked >= expected,
    `checked ${checked} Markdown files, expected at least ${expected}`,
  );
});

test("US-QG-02: broken links planted in a copy of the real docs/ and root Markdown fail the check", () => {
  // The copy holds the real Markdown files (docs/ and the root *.md files) at their real paths. Only the planted
  // links are asserted: a copy can lack the target of an unrelated link, so the copy is not checked for being clean.
  const root = fixtureRoot({});
  try {
    cpSync(join(repoRoot, "docs"), join(root, "docs"), {
      recursive: true,
      filter: (src) => statSync(src).isDirectory() || src.endsWith(".md"),
    });
    for (const file of readdirSync(repoRoot).filter((name) => name.endsWith(".md"))) {
      copyFileSync(join(repoRoot, file), join(root, file));
    }

    const planted = "docs/guides/principles/prin-036-markdown-lint-and-links.md";
    appendFileSync(join(root, planted), "\n[planted](does-not-exist.md)\n");
    appendFileSync(join(root, "CLAUDE.md"), "\n[planted](does-not-exist.md)\n");

    const run = runCheck(root);
    assert.strictEqual(
      run.status,
      1,
      `expected exit 1, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
    const reported = run.stderr.split("\n");
    assert.ok(
      reported.some((line) => line.startsWith(`${planted}:`) && line.includes("[planted]")),
      `planted link in ${planted} not reported:\n${run.stderr}`,
    );
    assert.ok(
      reported.some((line) => line.startsWith("CLAUDE.md:") && line.includes("[planted]")),
      `planted link in CLAUDE.md not reported:\n${run.stderr}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-QG-02: dependencies, worktrees, build output, caches and records are not read", () => {
  const broken = "# Broken\n\n[gone](./gone.md)\n";
  const root = fixtureRoot({
    "docs/guides/ok.md": "# Ok\n",
    "node_modules/pkg/README.md": broken,
    "app/node_modules/pkg/README.md": broken,
    ".worktrees/other-session/docs/x.md": broken,
    ".cache/x.md": broken,
    "dist/x.md": broken,
    "app/coverage/x.md": broken,
    "app/packages/core/coverage/x.md": broken,
    "app/packages/e2e/test-results/x.md": broken,
    "app/packages/e2e/playwright-report/x.md": broken,
    "docs/records/test-logs/x.md": broken,
  });
  try {
    const run = runCheck(root);
    assert.strictEqual(
      run.status,
      0,
      `expected exit 0, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
    assert.match(run.stdout, /All relative links are valid/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-QG-02: a source folder named coverage is read, only vitest output under app/ is skipped", () => {
  const broken = "[gone](./gone.md)\n";
  const root = fixtureRoot({
    "app/tools/check/quality/coverage/notes.md": broken,
  });
  try {
    const run = runCheck(root);
    assert.strictEqual(
      run.status,
      1,
      `expected exit 1, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
    assert.match(run.stderr, /app\/tools\/check\/quality\/coverage\/notes\.md:1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-QG-02: symbolic links are not followed, so nothing outside the repository is read through one", () => {
  const outside = mkdtempSync(join(tmpdir(), "check-links-outside-"));
  writeFileSync(join(outside, "elsewhere.md"), "[gone](./gone.md)\n");
  const root = fixtureRoot({ "docs/guides/ok.md": "# Ok\n" });
  try {
    symlinkSync(outside, join(root, "docs", "linked"));
    const run = runCheck(root);
    assert.strictEqual(
      run.status,
      0,
      `expected exit 0, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("US-QG-04: a Markdown file that cannot be read fails the check and is named", (t) => {
  // Root reads a file whatever its mode, so chmod cannot make it unreadable there.
  if (process.getuid?.() === 0) return t.skip("root can read a file without permissions");
  const root = fixtureRoot({
    "docs/guides/ok.md": "# Ok\n",
    "docs/guides/locked.md": "# Locked\n",
  });
  const locked = join(root, "docs", "guides", "locked.md");
  try {
    chmodSync(locked, 0o000);
    const run = runCheck(root);
    assert.strictEqual(
      run.status,
      1,
      `expected exit 1, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
    assert.match(run.stderr, /docs\/guides\/locked\.md: cannot be read \(/);
    assert.match(run.stderr, /1 of 2 Markdown files were not checked/);
    assert.doesNotMatch(run.stdout, /All relative links are valid/);
    assert.doesNotMatch(run.stderr, /All relative links are valid/);
  } finally {
    chmodSync(locked, 0o644);
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-QG-04: a broken link and an unreadable file in one run are both reported", (t) => {
  if (process.getuid?.() === 0) return t.skip("root can read a file without permissions");
  const root = fixtureRoot({
    "docs/guides/broken.md": "# Broken\n\nSee [the missing page](./missing.md).\n",
    "docs/guides/locked.md": "# Locked\n",
  });
  const locked = join(root, "docs", "guides", "locked.md");
  try {
    chmodSync(locked, 0o000);
    const run = runCheck(root);
    assert.strictEqual(
      run.status,
      1,
      `expected exit 1, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
    assert.match(run.stderr, /docs\/guides\/broken\.md:3 \[the missing page\]\(\.\/missing\.md\)/);
    assert.match(run.stderr, /docs\/guides\/locked\.md: cannot be read \(/);
    assert.doesNotMatch(run.stdout, /All relative links are valid/);
    assert.doesNotMatch(run.stderr, /All relative links are valid/);
  } finally {
    chmodSync(locked, 0o644);
    rmSync(root, { recursive: true, force: true });
  }
});
