// User-facing changelog gate (QG-U3): a PR whose title has type `feat` or `fix` must add an entry to the German
// changelog file ("Neu in dieser Version", shown by the app) or say `[skip-changelog]` in its title or body.
// Inputs come from environment variables, never from the command line (PR titles and bodies are untrusted input).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CHANGELOG_FILE = "app/packages/web/src/news/news.de.json";
export const SKIP_MARKER = "[skip-changelog]";
const USER_FACING_TYPES = new Set(["feat", "fix"]);

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

/** @returns {{ok: boolean, message: string}} */
export function checkChangelog({ title, body = "", changedFiles }) {
  const type = commitType(title);
  if (!type || !USER_FACING_TYPES.has(type))
    return { ok: true, message: `changelog: type "${type ?? "unknown"}" needs no entry` };
  if (changedFiles.includes(CHANGELOG_FILE))
    return { ok: true, message: `changelog: ${CHANGELOG_FILE} is updated` };
  if (`${title}\n${body}`.toLowerCase().includes(SKIP_MARKER))
    return { ok: true, message: `changelog: skipped via ${SKIP_MARKER}` };
  return {
    ok: false,
    message:
      `changelog: a "${type}:" PR needs a short German entry in ${CHANGELOG_FILE} ("Neu in dieser Version"). ` +
      `If the change is internal and users see nothing, put ${SKIP_MARKER} in the PR title or description.`,
  };
}

function changedFilesSince(base) {
  const out = execFileSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

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
    changedFiles: changedFilesSince(env.PR_BASE_SHA),
  });
  (result.ok ? console.log : console.error)(result.message);
  return result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.env));
