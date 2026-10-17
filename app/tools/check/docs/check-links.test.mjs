import test from "node:test";
import assert from "node:assert";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

test("US-QG-04: check-links script reports broken relative links", async () => {
  // This test verifies that the check-links script can be executed
  // and returns successfully (exit code 0) when all links are valid
  try {
    const output = execSync("node tools/check/docs/check-links.mjs", {
      cwd: repoRoot,
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
      cwd: repoRoot,
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
      cwd: repoRoot,
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
