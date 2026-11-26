// Tests of the open-for-write modes (US-QG-07, issue 2554, round 3): a script that opens a gate file with r+, w+ or a must be refused,
// and a read mode must pass. Pure: a fixed table of gate files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bashGateWrite } from "./bash-writes.mjs";

const isGate = (p) => p === "/repo/Makefile";
const decisionOf = (command) =>
  bashGateWrite(command, "/repo", isGate, { readScript: () => "" })?.decision ?? "none";

test("US-QG-07, issue 2554, round 3: a script that opens a gate file for r+, w+ or a is refused", () => {
  assert.equal(decisionOf(`python3 -c "open('Makefile','r+').write('x')"`), "deny");
  assert.equal(decisionOf(`python3 -c "open('Makefile','w+').write('x')"`), "deny");
  assert.equal(decisionOf(`python3 -c "open('Makefile','a').write('x')"`), "deny");
  assert.equal(decisionOf(`python3 -c "open('Makefile','ab').write('x')"`), "deny");
});

test("US-QG-07, issue 2554, round 3: a read of a gate file by a script passes, in r and rb", () => {
  assert.equal(decisionOf(`python3 -c "open('Makefile','r').read()"`), "none");
  assert.equal(decisionOf(`python3 -c "open('Makefile','rb').read()"`), "none");
});
