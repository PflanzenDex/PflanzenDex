// US-DEV-06 (#1486): the release tool writes news.de.json and deletes the fragments. The rules themselves are tested in
// app/packages/web/src/news/news-lines.test.ts; these tests run the file system part in throwaway folders.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import layout from "../../app/config/lint/layout.config.mjs";
import {
  FRAGMENT_DIR,
  isFragmentName,
} from "../../app/packages/web/src/app/destinations/account-area/whats-new/news-lines.mjs";
import {
  cutRelease,
  formatNews,
  localDate,
  main,
  NEWS_FILE,
  readUnreleased,
} from "./news-release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repo root with news.de.json and the given fragment files (name -> content); fragments null = no folder. */
function repoWith(news, fragments = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "news-release-"));
  made.push(root);
  mkdirSync(path.join(root, path.dirname(NEWS_FILE)), { recursive: true });
  writeFileSync(path.join(root, NEWS_FILE), formatNews(news));
  mkdirSync(path.join(root, FRAGMENT_DIR), { recursive: true });
  for (const [name, content] of Object.entries(fragments)) {
    writeFileSync(path.join(root, FRAGMENT_DIR, name), content);
  }
  return root;
}

const readNews = (root) => JSON.parse(readFileSync(path.join(root, NEWS_FILE), "utf8"));
const fragmentNames = (root) => readdirSync(path.join(root, FRAGMENT_DIR)).sort();

test("US-DEV-06 the release moves the fragments and the unreleased lines into the version and deletes the fragments", () => {
  const root = repoWith(
    { unreleased: ["Alt"], versions: [{ version: "1.0.0", date: "2026-10-01", lines: ["V0"] }] },
    {
      "1490-neu.json": '{ "line": "Neu" }\n',
      "1480-aelter.json": '{ "line": "Älter" }\n',
    },
  );
  cutRelease({ root, version: "1.1.0", date: "2026-11-06" });
  assert.deepEqual(readNews(root), {
    unreleased: [],
    versions: [
      { version: "1.1.0", date: "2026-11-06", lines: ["Neu", "Älter", "Alt"] },
      { version: "1.0.0", date: "2026-10-01", lines: ["V0"] },
    ],
  });
  assert.deepEqual(fragmentNames(root), []);
});

test("US-DEV-06 a version that exists already is refused, and nothing is written or deleted", () => {
  const news = {
    unreleased: [],
    versions: [{ version: "1.0.0", date: "2026-10-01", lines: ["V0"] }],
  };
  const root = repoWith(news, { "1490-neu.json": '{ "line": "Neu" }' });
  const before = readFileSync(path.join(root, NEWS_FILE), "utf8");
  assert.throws(() => cutRelease({ root, version: "1.0.0", date: "2026-11-06" }), /exists already/);
  assert.equal(readFileSync(path.join(root, NEWS_FILE), "utf8"), before);
  assert.deepEqual(fragmentNames(root), ["1490-neu.json"]);
});

test("US-DEV-06 a fragment without a line blocks the release, and nothing is written", () => {
  const root = repoWith(
    { unreleased: ["Alt"], versions: [] },
    { "1490-leer.json": '{ "line": " " }' },
  );
  const before = readFileSync(path.join(root, NEWS_FILE), "utf8");
  assert.throws(
    () => cutRelease({ root, version: "1.1.0", date: "2026-11-06" }),
    /1490-leer\.json/,
  );
  assert.equal(readFileSync(path.join(root, NEWS_FILE), "utf8"), before);
  assert.deepEqual(fragmentNames(root), ["1490-leer.json"]);
});

test("US-DEV-06 files in the folder that are not fragments are left alone", () => {
  const root = repoWith(
    { unreleased: [], versions: [] },
    { "1490-neu.json": '{ "line": "Neu" }', "README.md": "# Hinweis", "notes.txt": "x" },
  );
  cutRelease({ root, version: "1.1.0", date: "2026-11-06" });
  assert.deepEqual(fragmentNames(root), ["README.md", "notes.txt"]);
  assert.deepEqual(readNews(root).versions[0].lines, ["Neu"]);
});

test("US-DEV-06 a missing fragment folder counts as no fragments, the legacy lines still move", () => {
  const root = repoWith({ unreleased: ["Alt A", "Alt B"], versions: [] });
  rmSync(path.join(root, FRAGMENT_DIR), { recursive: true });
  assert.deepEqual(readUnreleased(root).fragments, []);
  cutRelease({ root, version: "1.1.0", date: "2026-11-06" });
  assert.deepEqual(readNews(root).versions[0].lines, ["Alt A", "Alt B"]);
});

test("US-DEV-06 the news file is written in the format it has, so a release changes only the lines", () => {
  const real = readFileSync(path.join(ROOT, NEWS_FILE), "utf8");
  assert.equal(formatNews(JSON.parse(real)), real);
});

test("US-DEV-06 the release date is the local calendar date, not the UTC date", () => {
  assert.equal(localDate(new Date(2026, 10, 6, 23, 30)), "2026-11-06");
  assert.equal(localDate(new Date(2026, 0, 1, 0, 5)), "2026-01-01");
});

test("US-DEV-06 the layout collection of the fragment folder and the fragment name rule agree", () => {
  const rule = layout.dirs.find((entry) => entry.path === FRAGMENT_DIR);
  assert.ok(rule?.collection, "the layout config names the fragment folder as a collection");
  for (const name of [
    "1486-news-entries.json",
    "1-a.json",
    "1486.json",
    "news.de.json",
    "1486-News.json",
    "1486-a.json.bak",
    "x-1486-a.json",
  ]) {
    assert.equal(rule.collection.test(name), isFragmentName(name), name);
  }
});

test("US-DEV-06 main reports a missing VERSION with exit code 2 and a bad version with 1", () => {
  assert.equal(main(["node", "news-release.mjs"], ROOT), 2);
  const root = repoWith({ unreleased: ["Alt"], versions: [] });
  assert.equal(main(["node", "news-release.mjs", "v1.1.0"], root), 1);
  assert.deepEqual(readNews(root).unreleased, ["Alt"]);
});
