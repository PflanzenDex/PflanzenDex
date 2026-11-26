// Tests for who may edit a gate file and how the hook answers (US-QG-07, owner decision d-144, issue 2554): pure functions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gateEditVerdict, isSubagent, questionReason } from "./gate-guard.mjs";

const FILE = "Makefile";
const QUESTION = `${FILE} defines a gate, threshold or exception list. Agents change it only after a human confirms, and never to turn a red run green.`;

test("US-QG-07, issue 2554, round 3: a subagent is told by its agent_id or by a subagent transcript; a main transcript says false; no signal says null", () => {
  assert.equal(isSubagent({ agent_id: "a1b2" }), true);
  assert.equal(isSubagent({ agent_id: "a1b2", transcript_path: "/x/projects/p/abc.jsonl" }), true);
  assert.equal(isSubagent({ transcript_path: "/x/projects/p/abc/subagents/agent-1.jsonl" }), true);
  assert.equal(isSubagent({ transcript_path: "/x/projects/p/abc.jsonl" }), false);
  assert.equal(isSubagent({ agent_id: "" }), null);
  assert.equal(isSubagent({ agent_id: 7 }), null);
  assert.equal(isSubagent({}), null, "a missing signal is unknown, never silent");
});

test("US-QG-07, issue 2554, round 3: an edit whose caller is unknown is asked in the default mode, even when the branch allows the file", () => {
  assert.equal(
    gateEditVerdict({ subagent: null, mode: "default", needsAsk: false, file: FILE })?.decision,
    "ask",
  );
  assert.equal(
    gateEditVerdict({ subagent: null, mode: "auto", needsAsk: false, file: FILE })?.decision,
    "ask",
  );
});

test("US-QG-07, issue 2554: a subagent is denied an edit of a gate file, whatever the mode and whether a question was answered", () => {
  for (const mode of [undefined, "default", "acceptEdits", "auto", "bypassPermissions", "dontAsk"])
    for (const needsAsk of [true, false]) {
      const result = gateEditVerdict({ subagent: true, mode, needsAsk, file: FILE });
      assert.equal(result?.decision, "deny", `${mode} ${needsAsk}`);
      assert.equal(result.source, "subagent");
      assert.equal(
        result.reason,
        "Subagents do not edit gate files. Report the change to the ticket lead; the main session makes it after the owner answers (owner decision d-144, issue 2554).",
      );
    }
});

test("US-QG-07, issue 2554: the automatic modes ask at every gate file edit, also for an allowed file (d-145)", () => {
  for (const mode of ["auto", "bypassPermissions", "dontAsk"])
    for (const needsAsk of [true, false]) {
      const result = gateEditVerdict({ subagent: false, mode, needsAsk, file: FILE });
      assert.equal(result?.decision, "ask", `${mode} ${needsAsk}`);
      assert.equal(result.source, "mode");
      assert.equal(result.reason, questionReason(FILE));
    }
});

test("US-QG-07, issue 2554: the main session in the default mode is asked while the file is not confirmed, with the question text", () => {
  for (const mode of [undefined, "default", "acceptEdits"]) {
    const result = gateEditVerdict({ subagent: false, mode, needsAsk: true, file: FILE });
    assert.deepEqual(result, { decision: "ask", reason: QUESTION, source: "question" });
  }
});

test("US-QG-07, issue 2554: the main session in the default mode gets no verdict for a file that a permanent record confirmed", () => {
  assert.equal(
    gateEditVerdict({ subagent: false, mode: "default", needsAsk: false, file: FILE }),
    null,
  );
});

test("US-QG-07, issue 2554: the question names the file and says nothing about later edits or the plan", () => {
  const { reason } = gateEditVerdict({
    subagent: false,
    mode: "default",
    needsAsk: true,
    file: "AGENTS.md",
  });
  assert.equal(
    reason,
    "AGENTS.md defines a gate, threshold or exception list. Agents change it only after a human confirms, and never to turn a red run green.",
  );
  assert.doesNotMatch(reason, /later edits|plan/);
});
