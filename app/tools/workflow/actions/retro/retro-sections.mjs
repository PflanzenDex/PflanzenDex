// Markdown of the process share (E-30) and of the implementer rework (US-DEV-11) in the report issue. The rules are in
// retro-lib.mjs. The rework block sits between its markers: a run that does not compute the rework copies it over.
import { LONG_DAYS, TZ } from "./retro-lib.mjs";

const REWORK_START = "<!-- retro:rework:start -->";
const REWORK_END = "<!-- retro:rework:end -->";
const REWORK_PENDING = "Implementer rework: computed by the nightly run.";
// The day the Implementer trailer was introduced (US-DEV-11): earlier pull requests carry none and are not counted.
export const TRAILER_SINCE = "2026-11-09";

const percent = (share) => (share === null ? "unknown" : `${Math.round(100 * share)} %`);

/** Process share (E-30): merged pull requests into dev and the share of process work, for the last 7 and 28 full days. */
export function processSection(windows) {
  return [
    "## Process share (E-30)",
    "",
    `Merged pull requests into \`dev\`. Process work is the Conventional-Commit scope \`dev\`, \`qg\` or \`ci\`; \`docs:\` without a scope is not. Full days in ${TZ}, today left out.`,
    "",
    "| Window | Merged PRs | Process PRs | Share |",
    "| --- | --: | --: | --: |",
    ...windows.map(
      (w) => `| Last ${w.days} full days | ${w.merged} | ${w.process} | ${percent(w.share)} |`,
    ),
  ].join("\n");
}

/** Table of the implementer rework by kind (US-DEV-11); `rows` as reworkByKind gives them, the total row last. */
export function reworkTable(rows) {
  return [
    "| Kind | PRs with implementer commits | PRs with rework | Share | Median rework commits |",
    "| --- | --: | --: | --: | --: |",
    ...rows.map((r) => {
      const name = r.total ? `**${r.kind}**` : r.kind;
      const median = r.median === null ? "unknown" : String(r.median);
      return `| ${name} | ${r.prs} | ${r.withRework} | ${percent(r.share)} | ${median} |`;
    }),
  ].join("\n");
}

/** The implementer rework block between its markers (US-DEV-11), computed by the scheduled and manual runs. */
export function reworkSection(rows) {
  return [
    REWORK_START,
    `## Implementer rework (last ${LONG_DAYS} days)`,
    "",
    "Rework: commits without the `Implementer:` trailer that come after the first implementer commit of a merged pull request; the claim commit and merge commits are left out. A pull request counts for the kind with the most changed files (ties: UI/layout, core/API, tooling/gates, docs, other).",
    "",
    `Attribution starts on ${TRAILER_SINCE}, the day the trailer was introduced; earlier pull requests carry no trailer and are not counted.`,
    "",
    reworkTable(rows),
    REWORK_END,
  ].join("\n");
}

/**
 * The implementer rework block of a run that does not compute it: copied unchanged from the report body that is there,
 * or the pending text (between the markers) when there is none (US-DEV-11).
 */
export function keptRework(previousBody) {
  const start = previousBody?.indexOf(REWORK_START) ?? -1;
  const end = start < 0 ? -1 : previousBody.indexOf(REWORK_END, start);
  if (end < 0) return [REWORK_START, REWORK_PENDING, REWORK_END].join("\n");
  return previousBody.slice(start, end + REWORK_END.length);
}
