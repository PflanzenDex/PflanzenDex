// User-facing changelog gate (QG-U3, US-DEV-06): a PR whose title has type `feat` or `fix` adds one NEW fragment file,
// app/packages/web/src/news/unreleased/<issue>-<slug>.json with a non-empty "line", or says `[skip-changelog]` in its
// title or body. Editing or deleting an existing entry does not count. Inputs come from environment variables, never from
// the command line (PR titles and bodies are untrusted input).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  FRAGMENT_DIR,
  fragmentLine,
  isFragmentName,
} from "../../../packages/web/src/app/destinations/account-area/whats-new/news-lines.mjs";

export const CHANGELOG_FILE = "app/packages/web/src/news/news.de.json";
export const SKIP_MARKER = "[skip-changelog]";
const USER_FACING_TYPES = new Set(["feat", "fix"]);

/** True for a path directly in the fragment folder whose name is a fragment name. */
export const isFragmentPath = (path) =>
  path.startsWith(`${FRAGMENT_DIR}/`) && isFragmentName(path.slice(FRAGMENT_DIR.length + 1));

export function commitType(title) {
  const colon = title.indexOf(":");
  if (colon < 0) return null;
  const type = title
    .slice(0, colon)
    .replace(/!$/, "")
    .replace(/\(.*\)$/, "")
    .trim();
  return /^[A-Za-z]+$/.test(type) ? type.toLowerCase() : null;
}

/**
 * @param {{title: string, body?: string, changes: {status: string, path: string}[], readFile: (path: string) => string}} input
 *   `changes` are the files of the PR against its base (status A, M or D); `readFile` returns a file's text at the PR head.
 * @returns {{ok: boolean, message: string}}
 */
export function checkChangelog({ title, body = "", changes, readFile }) {
  const type = commitType(title);
  if (!type || !USER_FACING_TYPES.has(type))
    return { ok: true, message: `changelog: type "${type ?? "unknown"}" needs no entry` };
  const added = changes
    .filter((change) => change.status === "A" && isFragmentPath(change.path))
    .map((change) => change.path);
  const withLine = added.filter((path) => fragmentLine(readFile(path)) !== null);
  if (withLine.length > 0)
    return { ok: true, message: `changelog: ${withLine.join(", ")} adds the line` };
  if (`${title}\n${body}`.toLowerCase().includes(SKIP_MARKER))
    return { ok: true, message: `changelog: skipped via ${SKIP_MARKER}` };
  const reasons = [];
  if (added.length > 0) reasons.push(`${added.join(", ")} has no non-empty "line"`);
  if (changes.some((change) => change.path === CHANGELOG_FILE))
    reasons.push(`${CHANGELOG_FILE} takes no new lines any more, the release moves them there`);
  return {
    ok: false,
    message:
      `changelog: a "${type}:" PR needs one new fragment ${FRAGMENT_DIR}/<issue>-<slug>.json with {"line": "<German text>"} ("Neu in dieser Version"). ` +
      (reasons.length > 0 ? `${reasons.join("; ")}. ` : "") +
      `If the change is internal and users see nothing, put ${SKIP_MARKER} in the PR title or description.`,
  };
}

/** The files the PR changes against its base, with their status; renames are shown as a delete and an add. */
function changesSince(base) {
  const out = execFileSync("git", ["diff", "--name-status", "--no-renames", "-z", base, "HEAD"], {
    encoding: "utf8",
  });
  const parts = out.split("\0").filter(Boolean);
  const changes = [];
  for (let i = 0; i + 1 < parts.length; i += 2)
    changes.push({ status: parts[i], path: parts[i + 1] });
  return changes;
}

const textAtHead = (path) => execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" });

function main(env) {
  const title = env.PR_TITLE;
  if (!title) {
    console.error("changelog: PR_TITLE is not set (this check runs for pull requests)");
    return 2;
  }
  // The release PR dev -> main only carries what was already checked when it entered dev.
  if (env.PR_BASE_REF === "main") {
    console.log("changelog: release PR into main, entries were checked on entry into dev");
    return 0;
  }
  if (!env.PR_BASE_SHA) {
    console.error("changelog: PR_BASE_SHA is not set");
    return 2;
  }
  const result = checkChangelog({
    title,
    body: env.PR_BODY ?? "",
    changes: changesSince(env.PR_BASE_SHA),
    readFile: textAtHead,
  });
  (result.ok ? console.log : console.error)(result.message);
  return result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.env));
