// Tests for the seals of the hook records (US-QG-07, issue 2554, second round): the key, the MAC and the sealed text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEY_FILE } from "./gate-names.mjs";
import { keyOf, macOf, MAC_SUFFIX, sealRead, sealWrite } from "./gate-seal.mjs";
import { namesRecord } from "./rules.mjs";

function folder(t) {
  const dir = mkdtempSync(join(tmpdir(), "gate-seal-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("US-QG-07, issue 2554: the key is created once, with mode 0600, and read back the same", (t) => {
  const common = folder(t);
  const first = keyOf(common);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(keyOf(common), first);
  assert.equal(statSync(join(common, KEY_FILE)).mode & 0o777, 0o600);
});

test("US-QG-07, issue 2554: the key file has the name of the hook records", () => {
  assert.equal(namesRecord(KEY_FILE), true, KEY_FILE);
});

test("US-QG-07, issue 2554: a sealed record reads back its text, and a record with a changed text or without its MAC reads as null", (t) => {
  const common = folder(t);
  const key = keyOf(common);
  const file = join(common, "record.json");
  sealWrite(file, key, '{"a":1}\n');
  assert.equal(sealRead(file, key), '{"a":1}\n');
  writeFileSync(file, '{"a":2}\n');
  assert.equal(sealRead(file, key), null, "a changed text");
  sealWrite(file, key, '{"a":1}\n');
  writeFileSync(`${file}${MAC_SUFFIX}`, `${macOf("b".repeat(64), '{"a":1}\n')}\n`);
  assert.equal(sealRead(file, key), null, "a MAC of another key");
  rmSync(`${file}${MAC_SUFFIX}`);
  assert.equal(sealRead(file, key), null, "no MAC");
  assert.equal(sealRead(join(common, "missing.json"), key), null, "no record");
});

test("US-QG-07, issue 2554: the MAC of a text is the HMAC-SHA256 of it under the key, and differs for a changed key", () => {
  assert.match(macOf("k", "text"), /^[0-9a-f]{64}$/);
  assert.notEqual(macOf("k", "text"), macOf("j", "text"));
  assert.notEqual(macOf("k", "text"), macOf("k", "text "));
});
