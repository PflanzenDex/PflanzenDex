// Reads migration names from git refs and open PRs with as few gh calls as possible (rate limit is shared).
import { execFileSync } from "node:child_process";
import { MIGRATIONS_DIR, numberOf, reservedIn } from "./migration-lib.mjs";

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Migration file names (basenames) in a ref; undefined when the ref does not exist. */
export function migrationsAt(ref, cwd) {
  try {
    return git(["ls-tree", "--name-only", ref, `${MIGRATIONS_DIR}/`], cwd)
      .split("\n")
      .filter((f) => numberOf(f) !== undefined)
      .map((f) => f.split("/").pop());
  } catch {
    return undefined;
  }
}

/** One gh call: head branch and body of every open PR. */
export function openPrs(run = (a) => execFileSync("gh", a, { encoding: "utf8" })) {
  return JSON.parse(
    run(["pr", "list", "--state", "open", "--limit", "200", "--json", "headRefName,body"]),
  );
}

/** Everything that already holds a number: dev, every open PR branch, and reservations in PR bodies. */
export function collect({ cwd, branch, prs = openPrs() }) {
  const taken = new Set();
  const note = (files) => files?.forEach((f) => taken.add(numberOf(f)));
  note(migrationsAt("origin/dev", cwd));
  let own;
  for (const pr of prs) {
    const reserved = reservedIn(pr.body);
    if (pr.headRefName === branch) own = reserved;
    else if (reserved !== undefined) taken.add(reserved);
    if (pr.headRefName !== branch) note(migrationsAt(`origin/${pr.headRefName}`, cwd));
  }
  return { taken: [...taken], own };
}
