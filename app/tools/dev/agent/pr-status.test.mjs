import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChecks, summarizeChecks } from "./pr-status.mjs";

test("US-DEV-12: only non-green jobs are listed, with a summary", () => {
  const out = summarizeChecks([
    { name: "app", bucket: "pass" },
    { name: "docs", bucket: "pass" },
    { name: "e2e", bucket: "pending" },
    { name: "lint", bucket: "fail" },
    { name: "optional", bucket: "skipping" },
  ]);
  assert.equal(out, "2 green, 1 open, 1 red\nred: lint\nopen: e2e");
});

test("US-DEV-12: all green is one line", () => {
  assert.equal(summarizeChecks([{ name: "app", bucket: "pass" }]), "1 green, 0 open, 0 red");
});

test("US-DEV-12: no checks yet is reported, not hidden", () => {
  assert.equal(summarizeChecks([]), "no checks reported yet");
});

test("US-DEV-12: parseChecks reads the tab-separated gh output", () => {
  assert.deepEqual(parseChecks("app\tpass\t39s\thttps://x\ne2e\tpending\t0\thttps://y\n"), [
    { name: "app", bucket: "pass" },
    { name: "e2e", bucket: "pending" },
  ]);
});
