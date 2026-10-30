// Reference gate (US-QG-10, FR-QG-25, QG-T5): what a feature adds is named in the reference docs, so agents find the
// building blocks that exist instead of rediscovering them in the code or building them twice.
//   node tools/check/docs/agents/check-reference.mjs                  check against app/config/gates/baselines/reference-baseline.json
//   node tools/check/docs/agents/check-reference.mjs --write-baseline create the baseline, or lower it; never enlarge it
// This check fails when
//   RF-1  an API route is not named in docs/guides/reference/app.md as `METHOD /path` (parameter names may differ),
//   RF-2  a core operation (`defineOperation({ name })`) is not named in app.md as `domain.verb`,
//   RF-3  a component of components/ui or components/shared is not named in docs/guides/reference/design-system.md
//         as `Name` or `<Name`,
//   RF-4  a baseline entry is documented now or no longer exists in the code (delete the entry),
//   RF-5  the baseline holds an entry that the baseline on dev does not have (it only shrinks).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  APP,
  apiRoutes,
  coreOperations,
  routeKey,
  sharedComponents,
} from "./reference-sources.mjs";

const ROOT = path.resolve(APP, "..");
export const APP_DOC = "docs/guides/reference/app.md";
export const DS_DOC = "docs/guides/reference/design-system.md";
const BASELINE_PATH = "app/config/gates/baselines/reference-baseline.json";
const devRef = process.env.REFERENCE_BASE ?? "origin/dev";

export const KINDS = {
  routes: {
    rule: "RF-1",
    doc: APP_DOC,
    hint: "name it as `METHOD /path` in the section of its story",
  },
  operations: {
    rule: "RF-2",
    doc: APP_DOC,
    hint: "name it as `domain.verb` in the section of its story",
  },
  components: { rule: "RF-3", doc: DS_DOC, hint: "add it to the component inventory" },
};

const backticked = (doc) => [...doc.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

/** What a doc names: route keys, backticked words and JSX tags. */
export function documented(doc) {
  const routes = new Set();
  for (const t of backticked(doc)) {
    const m = t.match(/^(GET|POST|PUT|PATCH|DELETE) (\/[^\s?]*)/);
    if (m) routes.add(routeKey(m[1], m[2]));
  }
  const words = new Set(backticked(doc));
  for (const m of doc.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) words.add(m[1]);
  return { routes, words };
}

/** Undocumented items per kind: { routes: [...], operations: [...], components: [...] }, sorted and unique. */
export function findGaps({ routes, operations, components }, { appDoc, dsDoc }) {
  const app = documented(appDoc);
  const ds = documented(dsDoc);
  const gaps = (items, known, key = (x) => x) =>
    [...new Set(items)].filter((x) => !known.has(key(x))).sort();
  return {
    routes: gaps(routes, app.routes, (r) => routeKey(...r.split(" "))),
    operations: gaps(operations, app.words),
    components: gaps(components, ds.words),
  };
}

/** Errors for gaps, the baseline and the baseline on dev (undefined when dev has none yet). */
export function compareBaseline(gaps, baseline, devBaseline) {
  const errors = [];
  for (const [kind, { rule, doc, hint }] of Object.entries(KINDS)) {
    const known = new Set(baseline[kind] ?? []);
    const open = new Set(gaps[kind]);
    for (const item of gaps[kind])
      if (!known.has(item)) errors.push(`${rule} ${item} is not named in ${doc}: ${hint}`);
    for (const item of known) {
      if (!open.has(item))
        errors.push(
          `RF-4 ${item} is documented now or gone from the code; delete its baseline entry`,
        );
      else if (devBaseline && !(devBaseline[kind] ?? []).includes(item))
        errors.push(
          `RF-5 ${item} is not in the baseline on dev; the baseline must not get new entries`,
        );
    }
  }
  return errors;
}

function devBaseline() {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${devRef}:${BASELINE_PATH}`], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return undefined; // no ref, or dev has no baseline yet (first PR)
  }
}

/** The baseline, or undefined when the file does not exist yet. One read, no check-then-read race. */
function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE_PATH), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function main(argv) {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
  const gaps = findGaps(
    { routes: apiRoutes(), operations: coreOperations(), components: sharedComponents() },
    { appDoc: read(APP_DOC), dsDoc: read(DS_DOC) },
  );
  const baseline = readBaseline();
  const count = (b) => Object.values(b).reduce((n, list) => n + list.length, 0);
  if (argv.includes("--write-baseline")) {
    const keep = baseline
      ? Object.fromEntries(
          Object.keys(KINDS).map((k) => [k, gaps[k].filter((x) => baseline[k]?.includes(x))]),
        )
      : gaps;
    fs.writeFileSync(path.join(ROOT, BASELINE_PATH), `${JSON.stringify(keep, null, 2)}\n`);
    console.log(`check-reference: wrote ${count(keep)} entries to ${BASELINE_PATH}`);
    return 0;
  }
  const errors = compareBaseline(gaps, baseline ?? {}, baseline ? devBaseline() : undefined);
  for (const e of errors) console.error(`check-reference: ${e}`);
  if (errors.length) return 1;
  console.log(`check-reference: ok (${count(gaps)} known gaps in the baseline)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  process.exit(main(process.argv.slice(2)));
