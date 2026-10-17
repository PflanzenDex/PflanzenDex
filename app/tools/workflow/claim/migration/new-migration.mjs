// `make migration NAME=<module>_<short_name>`: creates the migration with the next free number, looking at
// origin/dev, all open PR branches and a number reserved in the Handoff of this branch's PR (issue #831).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collect } from "./git-view.mjs";
import { MIGRATIONS_DIR, nextNumber, numberOf, pad } from "./migration-lib.mjs";

const NAME = /^[a-z][a-z0-9]*_[a-z0-9_]+$/;

export function stub(name, branch) {
  const story = /(?:us|fr|te)-[a-z]+-\d+/i.exec(branch)?.[0]?.toUpperCase() ?? "<story id>";
  return `-- module: ${name.split("_")[0]}\n-- ${story}: <what changes and why>\n`;
}

function main(name) {
  if (!NAME.test(name ?? "")) {
    console.error(
      "usage: make migration NAME=<module>_<short_name> (snake case, e.g. light_example)",
    );
    return 2;
  }
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  execFileSync("git", ["fetch", "--quiet", "--prune", "origin"], { cwd: root });
  const { taken, own } = collect({ cwd: root, branch });
  const dir = path.join(root, MIGRATIONS_DIR);
  for (const f of fs.readdirSync(dir)) if (numberOf(f) !== undefined) taken.push(numberOf(f));
  const number = nextNumber({ taken, own });
  const file = `${pad(number)}_${name}.sql`;
  fs.writeFileSync(path.join(dir, file), stub(name, branch), { flag: "wx" });
  console.log(
    `${MIGRATIONS_DIR}/${file}${own === number ? " (number reserved in the PR Handoff)" : ""}`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  process.exit(main(process.argv[2]));
