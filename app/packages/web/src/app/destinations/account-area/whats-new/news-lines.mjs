// US-DEV-06 (#1486): the changelog lines. Shared by the app (whats-new.ts), the release tool (tools/repo/news-release.mjs)
// and the QG-U3 gate (tools/check/release/check-changelog.mjs), so the order and the fragment rule are defined once.
// One fragment per PR lives in unreleased/; news.de.json keeps the lines that predate the fragments (unreleased) and each
// released version (versions, newest first). Pure functions only: no file system, no network.

/** Repo path of the fragment folder; the layout config (collection) and the gate use the same name pattern. */
export const FRAGMENT_DIR = "app/packages/web/src/news/unreleased";

const FRAGMENT_NAME = /^(\d+)-[a-z0-9-]+\.json$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a file name that is a fragment: the issue number, a dash, a slug and `.json`. */
export const isFragmentName = (name) => FRAGMENT_NAME.test(name);

const issueOf = (name) => {
  const match = FRAGMENT_NAME.exec(name);
  return match ? Number(match[1]) : -1;
};

const hasLine = (fragment) => typeof fragment.line === "string" && fragment.line.trim() !== "";

/**
 * The fragments in display order: the newest issue first (the higher number), a tie by file name. The order follows from
 * the names alone, so every device and the release see the same order, without git history.
 * @param {readonly {name: string}[]} fragments
 */
export function orderFragments(fragments) {
  return [...fragments].sort(
    (a, b) => issueOf(b.name) - issueOf(a.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

/** The line of a fragment file, or null when the file is not JSON with a non-empty `line` text. */
export function fragmentLine(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const line = parsed?.line;
  return typeof line === "string" && line.trim() !== "" ? line.trim() : null;
}

/** A calendar date as German text: "2026-11-06" becomes "06.11.2026". Anything else is shown as it is. */
export function germanDate(date) {
  return ISO_DATE.test(date)
    ? `${date.slice(8)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
    : String(date);
}

/**
 * The changelog as lines in display order: the fragments (newest issue first), the unreleased lines that predate them,
 * then each version (newest first). The first line of each group carries the group as its heading. A fragment without
 * a line is left out here; planRelease refuses it, so it cannot vanish at a release.
 */
export function newsEntries(news, fragments) {
  const unreleased = orderFragments(fragments.filter(hasLine)).map((f) => f.line.trim());
  const groups = [
    { heading: { version: null, date: null }, lines: [...unreleased, ...news.unreleased] },
    ...news.versions.map(({ version, date, lines }) => ({ heading: { version, date }, lines })),
  ];
  return groups.flatMap(({ heading, lines }) =>
    lines.map((text, index) => ({ text, heading: index === 0 ? heading : null })),
  );
}

/**
 * Moves the unreleased lines into a new version entry (US-DEV-06). The lines keep their display order, so
 * newsEntries(before) and newsEntries(after) list the same texts in the same order: no line is new, lost or shown twice.
 * `remove` names the fragments to delete once the lines are in news.de.json. Refuses a version that is not x.y.z or
 * exists already, a date that is not YYYY-MM-DD, a fragment without a line, and a release without any line.
 * @param {{news: {unreleased: string[], versions: object[]}, fragments: readonly {name: string, line: string | null}[], version: string, date: string}} input
 */
export function planRelease({ news, fragments, version, date }) {
  if (!VERSION.test(version)) throw new Error(`news-release: "${version}" is not a version x.y.z`);
  if (!ISO_DATE.test(date)) throw new Error(`news-release: "${date}" is not a date YYYY-MM-DD`);
  if (news.versions.some((entry) => entry.version === version)) {
    throw new Error(
      `news-release: version ${version} exists already in news.de.json, nothing was changed`,
    );
  }
  const ordered = orderFragments(fragments);
  const broken = ordered.filter((f) => !hasLine(f)).map((f) => f.name);
  if (broken.length > 0) {
    throw new Error(
      `news-release: no non-empty "line" in ${broken.join(", ")}, nothing was changed`,
    );
  }
  const lines = [...ordered.map((f) => f.line.trim()), ...news.unreleased];
  if (lines.length === 0)
    throw new Error("news-release: no unreleased line, so there is no version to cut");
  return {
    news: { ...news, unreleased: [], versions: [{ version, date, lines }, ...news.versions] },
    remove: ordered.map((f) => f.name),
    lines,
  };
}
