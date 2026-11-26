// Who may edit a gate file, and how the hook answers (US-QG-07, owner decision d-144, issue 2554). Pure; run.mjs calls it for
// every Edit, Write, MultiEdit or NotebookEdit of a file that asks (asksBeforeEdit).
// - A subagent never edits a gate file: the change goes to the ticket lead, and the main session makes it after the owner
//   answers. A branch allow does not change that.
// - In an automatic permission mode (auto, bypassPermissions, dontAsk) the main session is asked at every edit, also for a file
//   the branch allows (owner decision d-145). A subagent is still denied.
// - When the hook input does not say whether the caller is a subagent (null), the edit is asked, never silent (round 3).
// - Otherwise the owner is asked, unless the branch allows the file for good (make gate-allow, gate-confirmations.mjs).
//
// Known limits (round 3, owner decision d-146): the hooks guard against accidents, not against a determined agent. The GitHub
// identity ticket and the merge review are the enforcement, not these hooks. Specifically:
// - Any process that runs node as the user can forge an allowance: it can read the repository key and sign a record or a log line.
//   The seals (gate-seal.mjs) stop a forgery that does not know the key, not one that does.
// - `script` gives a command a pseudo-terminal, so `make gate-allow` run through it passes the terminal check.
// - The fingerprint and the Bash denylist see the gate files of the worktrees, not a write that lands outside them.

// The permission modes that answer a question without the owner (issue 2554).
const AUTOMATIC_MODES = new Set(["auto", "bypassPermissions", "dontAsk"]);

// Whether the edit comes from a subagent: true (the hook input names an agent, or its transcript is a subagent's), false (a
// transcript that is not a subagent's), null (the input says neither: the caller is unknown, and the edit is asked).
export function isSubagent(input) {
  if (typeof input.agent_id === "string" && input.agent_id !== "") return true;
  const transcript = input.transcript_path;
  if (typeof transcript !== "string") return null;
  return transcript.includes("/subagents/");
}

// The question about a gate file (US-QG-07). It names the file and says what an agent does with it; a yes covers this edit
// only, and the record that a branch allows a file is written by the owner's make gate-allow alone (issue 2554).
export function questionReason(file) {
  return `${file} defines a gate, threshold or exception list. Agents change it only after a human confirms, and never to turn a red run green.`;
}

// The verdict for an edit of a gate file: null (no question, the branch allows the file), or { decision, reason, source }.
// `needsAsk` is needsQuestion of the file on its branch (gate-confirmations.mjs). `subagent` is isSubagent(input). `source` names
// the rule that decided.
export function gateEditVerdict({ subagent, mode, needsAsk, file }) {
  if (subagent === true)
    return {
      decision: "deny",
      reason:
        "Subagents do not edit gate files. Report the change to the ticket lead; the main session makes it after the owner answers (owner decision d-144, issue 2554).",
      source: "subagent",
    };
  // Owner decision d-145: in an automatic mode the main session is asked at every edit, also for a file the branch allows, so the
  // question reaches the owner. The mode is logged with each decision (run.mjs).
  if (AUTOMATIC_MODES.has(mode))
    return { decision: "ask", reason: questionReason(file), source: "mode" };
  if (subagent === null || needsAsk)
    return { decision: "ask", reason: questionReason(file), source: "question" };
  return null;
}
