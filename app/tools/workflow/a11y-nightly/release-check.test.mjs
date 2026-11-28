// US-QG-02 (issue 2666): the release refuses unless the last nightly-a11y on the dev head is green. Pure functions only: the
// git and gh calls of the CLI are not made here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { judge, repoOf, shaToJudge, START_COMMAND } from "./release-check.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const status = (state, context = "nightly-a11y") => ({ context, state });

test("US-QG-02 the release passes only on a green nightly-a11y status of the dev head", () => {
  assert.equal(judge({ statuses: [status("success")] }, SHA).ok, true);
  const red = judge({ statuses: [status("failure")] }, SHA);
  assert.equal(red.ok, false);
  assert.match(red.message, /red on 0123.* \(failure\)/);
  assert.equal(judge({ statuses: [status("error")] }, SHA).ok, false);
});

test("US-QG-02 a pending or missing nightly-a11y status refuses and names the dispatch of the nightly on dev", () => {
  const pending = judge({ statuses: [status("pending")] }, SHA);
  assert.equal(pending.ok, false);
  assert.match(pending.message, /still pending/);
  assert.ok(pending.message.includes(START_COMMAND));
  const missing = judge({ statuses: [status("success", "ci-status")] }, SHA);
  assert.equal(missing.ok, false);
  assert.match(missing.message, /no run exists/);
  assert.equal(judge({}, SHA).ok, false);
});

test("US-QG-02 the latest status of the context decides (the API lists the newest first); other contexts do not count", () => {
  const newestRed = { statuses: [status("failure"), status("success")] };
  assert.equal(judge(newestRed, SHA).ok, false);
  const newestGreen = { statuses: [status("success"), status("failure")] };
  assert.equal(judge(newestGreen, SHA).ok, true);
  assert.equal(judge({ statuses: [status("failure", "other"), status("success")] }, SHA).ok, true);
});

test("US-QG-02 the sha to judge: the argument when it is a commit id, else the second parent of HEAD (the dev head of a release)", () => {
  assert.deepEqual(shaToJudge("0123456", ""), { sha: "0123456", note: "" });
  assert.throws(() => shaToJudge("main; rm -rf /", ""), /is no commit id/);
  const merge = "abc111 def222 0123456789abcdef0123456789abcdef01234567";
  assert.equal(shaToJudge(undefined, merge).sha, "0123456789abcdef0123456789abcdef01234567");
});

test("US-QG-02 a HEAD with one parent (a hotfix on main) has no release merge: nothing is judged, and a note says so", () => {
  const picked = shaToJudge(undefined, "abc111 def222");
  assert.equal(picked.sha, undefined);
  assert.match(picked.note, /hotfix on main/);
  assert.equal(shaToJudge(undefined, undefined).sha, undefined);
});

test("US-QG-02 the repository: GITHUB_REPOSITORY when set, else the repository that gh names", () => {
  assert.equal(
    repoOf({ GITHUB_REPOSITORY: "owner/repo" }, () => "never/called"),
    "owner/repo",
  );
  assert.equal(
    repoOf({}, () => "owner/other"),
    "owner/other",
  );
});
