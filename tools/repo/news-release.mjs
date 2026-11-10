// US-DEV-06 (#1486): `make news-release VERSION=<x.y.z>` cuts the unreleased changelog lines into a new version of
// app/packages/web/src/news/news.de.json and deletes their fragments. The lines move, nothing is copied, so no line shows
// twice. The person who cuts the release commits both changes as one commit (release-checklist, step 7b). The rules are
// pure and tested in app/packages/web/src/news/news-lines.test.ts (planRelease); this file does the file system part.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FRAGMENT_DIR,
  fragmentLine,
  isFragmentName,
  planRelease,
} from "../../app/packages/web/src/app/destinations/account-area/whats-new/news-lines.mjs";

export const NEWS_FILE = "app/packages/web/src/news/news.de.json";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** news.de.json and the fragment files of the unreleased folder; a missing folder has no fragments. */
export function readUnreleased(root) {
  const news = JSON.parse(readFileSync(path.join(root, NEWS_FILE), "utf8"));
  const dir = path.join(root, FRAGMENT_DIR);
  const names = existsSync(dir) ? readdirSync(dir).filter(isFragmentName).sort() : [];
  const fragments = names.map((name) => ({
    name,
    line: fragmentLine(readFileSync(path.join(dir, name), "utf8")),
  }));
  return { news, fragments };
}

/** The text of news.de.json: two-space JSON and a final newline, the format prettier keeps for this file. */
export function formatNews(news) {
  return `${JSON.stringify(news, null, 2)}\n`;
}

/**
 * Cuts the release. planRelease checks everything first, so nothing is written when it refuses. news.de.json is written
 * before the fragments are deleted: a deletion that fails leaves the lines in the version and names the fragments to
 * delete by hand, instead of losing lines.
 */
export function cutRelease({ root, version, date }) {
  const { news, fragments } = readUnreleased(root);
  const plan = planRelease({ news, fragments, version, date });
  writeFileSync(path.join(root, NEWS_FILE), formatNews(plan.news));
  const failed = [];
  for (const name of plan.remove) {
    try {
      rmSync(path.join(root, FRAGMENT_DIR, name));
    } catch (error) {
      failed.push(`${name} (${error.code ?? error.message})`);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `news-release: ${NEWS_FILE} holds version ${version} already; delete these fragments by hand, or their lines show twice: ${failed.join(", ")}`,
    );
  }
  return plan;
}

/** Today's date in the local calendar as YYYY-MM-DD: the release is cut on the machine of the person who cuts it. */
export function localDate(now = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export function main(argv, root = ROOT) {
  const version = argv[2];
  if (!version) {
    console.error("news-release: VERSION is missing; use make news-release VERSION=<x.y.z>");
    return 2;
  }
  try {
    const plan = cutRelease({ root, version, date: localDate() });
    console.log(
      `news-release: version ${version} holds ${plan.lines.length} line(s) in ${NEWS_FILE}; ${plan.remove.length} fragment(s) deleted.`,
    );
    console.log(
      `Commit both in one commit: git add -A app/packages/web/src/news && git commit -m "docs(dev): release news ${version} (US-DEV-06)"`,
    );
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv);
