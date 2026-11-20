// The result of a matrix job (issue 1682): a job with `strategy.matrix` has one check run per matrix value, named
// `<job> (<value>)`, here `app-tests-web (1)` and `app-tests-web (2)`. The job's result comes from its shards, as a plain
// job's comes from its one check run. ci-verdict.mjs judges the rows with these functions.
import { evidenceOf, isActionsCheck } from "../ci-reuse.mjs";

/** The job of a check run name: the part before the matrix value of `<job> (<value>)`, otherwise the name itself. */
export const jobOf = (name) => /^(.+?) \(.+\)$/.exec(name)?.[1] ?? name;

const doneTime = (ev) => Date.parse(ev.at ?? "") || 0;

/**
 * The shards of one job on the head: per check run name its evidence, and whether a run of it is still going. Beside the
 * expanded shards, the plain job name is no shard when its evidence is a cancelled run (issue 2303): a text-edit run cancels
 * the matrix job before it expands, and that run leaves a cancelled check run under the plain name. A run of the plain name
 * still going keeps it in the list (`open`). evidenceOf gives a skipped-only name no evidence, as before.
 */
export function shardsOf(checkRuns, job) {
  const names = [
    ...new Set(
      checkRuns.filter((c) => isActionsCheck(c) && jobOf(c.name) === job).map((c) => c.name),
    ),
  ].sort();
  const expanded = names.some((name) => name !== job);
  return names.map((name) => {
    const runs = checkRuns.filter((c) => c.name === name && isActionsCheck(c));
    const ev = evidenceOf(runs);
    const cancelledPlain = name === job && expanded && ev?.conclusion === "cancelled";
    return { ev: cancelledPlain ? null : ev, open: runs.some((r) => r.status !== "completed") };
  });
}

/**
 * The result of a job from its shards: a plain job has one, a matrix job one per matrix value. The first shard that did not
 * succeed decides, so one failed or cancelled shard is never hidden by a green one. `running` while a shard has no result
 * and a run of it is still going; `success` only when every shard succeeded; otherwise the fallback. `ev` is the evidence
 * that decides, else the latest one.
 */
export function resultOf(all, fallback) {
  // A name with only skipped runs did no work, as for a plain job: a text-edit run skips the matrix job unexpanded, under
  // the plain job name (PR 1683), and that check run is no shard. A cancelled plain run beside the expanded shards is none
  // either (issue 2303, see shardsOf).
  const shards = all.filter((s) => s.ev || s.open);
  const finished = shards.filter((s) => s.ev);
  const latest = finished.map((s) => s.ev).sort((a, b) => doneTime(b) - doneTime(a))[0] ?? null;
  const failed = finished.find((s) => s.ev.conclusion !== "success");
  if (failed) return { result: failed.ev.conclusion, ev: failed.ev };
  if (shards.some((s) => !s.ev && s.open)) return { result: "running", ev: latest };
  if (shards.length > 0 && finished.length === shards.length) {
    return { result: "success", ev: latest };
  }
  return { result: fallback, ev: latest };
}
