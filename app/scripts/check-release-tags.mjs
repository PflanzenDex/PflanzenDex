// Release tag check (FR-DEV-05, ADR 0002): versions only come from commits through semantic-release.
// Every `v*` tag must be SemVer, point at a commit on `main` and have a GitHub release created by the release
// workflow (github-actions[bot]); only the documented seed tag is exempt from the release rule. No package.json
// may carry a hand-written `version` field (the version comes from the tag). Detects after the fact and fails the run.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const SEED_TAG = "v0.0.0";
export const RELEASE_AUTHOR = "github-actions[bot]";

export function checkReleaseTags({ tags, releases, onMain, packageJsons }) {
  const problems = [];
  const releaseByTag = new Map(releases.map((r) => [r.tag, r]));
  for (const { name, sha } of tags) {
    if (!SEMVER.test(name)) problems.push(`${name}: tag is not SemVer (vMAJOR.MINOR.PATCH)`);
    if (!onMain(sha))
      problems.push(`${name}: tag points at ${sha.slice(0, 7)}, which is not on main`);
    if (name === SEED_TAG) continue;
    const release = releaseByTag.get(name);
    if (!release)
      problems.push(`${name}: no GitHub release (tag was not created by the release workflow)`);
    else if (release.author !== RELEASE_AUTHOR)
      problems.push(
        `${name}: release was created by ${release.author}, expected ${RELEASE_AUTHOR}`,
      );
  }
  for (const [file, json] of Object.entries(packageJsons))
    if (json && "version" in json)
      problems.push(`${file}: has a "version" field; versions come from tags only (ADR 0002)`);
  return problems;
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function collect(root) {
  const repo = process.env.GITHUB_REPOSITORY ?? "PflanzenDex/PflanzenDex";
  const tags = git(root, "tag", "--list", "v*")
    .split("\n")
    .filter(Boolean)
    .map((name) => ({ name, sha: git(root, "rev-list", "-n", "1", name) }));
  const releases = JSON.parse(
    execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${repo}/releases?per_page=100`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  )
    .flat()
    .map((r) => ({ tag: r.tag_name, author: r.author?.login }));
  const onMain = (sha) => {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { cwd: root });
      return true;
    } catch {
      return false;
    }
  };
  const files = git(root, "ls-files", "--", "package.json", "**/package.json")
    .split("\n")
    .filter(Boolean);
  const packageJsons = Object.fromEntries(
    files.map((f) => [f, JSON.parse(fs.readFileSync(path.join(root, f), "utf8"))]),
  );
  return { tags, releases, onMain, packageJsons };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  // semantic-release pushes the tag shortly before the release exists; on a tag push the workflow allows a short wait.
  const attempts = Number(process.env.RELEASE_TAG_CHECK_ATTEMPTS ?? 1);
  let problems = [];
  let data;
  for (let i = 1; i <= attempts; i++) {
    data = collect(root);
    problems = checkReleaseTags(data);
    if (problems.length === 0 || i === attempts) break;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  problems.forEach((p) => console.error(`check-release-tags: ${p}`));
  if (problems.length) process.exit(1);
  console.log(`check-release-tags: ${data.tags.length} tags, all from the release workflow`);
}
