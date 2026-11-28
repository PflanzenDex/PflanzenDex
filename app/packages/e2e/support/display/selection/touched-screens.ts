/* eslint-disable security/detect-non-literal-fs-filename -- the web sources and the register are fixed files of this repository */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import type { Screen } from "../one-screen/register.types";

// The touched-screens mapper of the UI gates (US-QG-02, d-190, issue 2666): the screens that a diff touches, so that a pull request
// runs one-screen and the keyboard walk for those only. Plain Node (`node touched-screens.ts <base-sha>`): node:* modules and type
// imports only. `make touched-screens` runs it for the job `changes` of ci.yml.

/** A shard holds 17 screens: about 100 s of stack start plus about 9 s per screen (run 46146654948: 33 screens in 419 s). */
export const SCREENS_PER_SHARD = 17;
/** The matrix of the job ui-shard never has more shards (the Free plan runs 20 jobs at once, see ci.yml). */
export const MAX_SHARDS = 5;

/** Imported unit -> the units that import it, from the import graph of the web sources. */
export type Importers = ReadonlyMap<string, ReadonlySet<string>>;

/** The homes of a screen by the first segment of its path (screen-homes.json, beside this file). */
const HOME_BY_PATH: Readonly<Record<string, readonly string[]>> = JSON.parse(
  readFileSync(new URL("./screen-homes.json", import.meta.url), "utf8"),
);
const WEB_SRC_FOLDER = new URL("../../../../web/src/", import.meta.url);
const WEB_SRC = "app/packages/web/src/";
const ROUTES_DIR = "app/packages/e2e/tests/accessibility/routes/";
/** The paths that can change a screen; anything else in the repository is no UI (docs, core, api, tools). */
const IN_SCOPE = [
  "app/packages/web/",
  "app/packages/e2e/",
  "app/packages/api/perf/demo-seed/",
  "app/packages/api/perf/catalog-seed/",
  "app/config/gates/",
  ".github/",
];
/** Modules that everything imports and that are no screen home: an importer is touched, the importers of a hub are not. */
const HUBS: ReadonlySet<string> = new Set(["app", "app/destinations/area-parts"]);
const SOURCE = /\.(ts|tsx|mjs)$/;
const SPECIFIER = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

/** The unit of a path under src/: its first segment, except the destinations, flows and legacy routes (own units). */
export function unitOf(relative: string): string {
  const parts = relative.split("/").filter((part) => part !== "");
  if (parts[0] !== "app") return parts[0] ?? "";
  const area = parts[1];
  if (area === "destinations") return parts.length >= 3 ? `app/destinations/${parts[2]}` : "app";
  if (area === "flows" || area === "legacy-routes") return `app/${area}`;
  return "app";
}

/** The units a screen is shown from (its layer file's unit and the units of its path); null when the path names no home. */
export function homeOf(screen: Screen): readonly string[] | null {
  const segment = (screen.path.split("?")[0] ?? "").split("/")[1] ?? "";
  const byPath = Object.hasOwn(HOME_BY_PATH, segment) ? HOME_BY_PATH[segment] : undefined;
  if (!byPath) return null;
  return screen.layerFile ? [...new Set([unitOf(screen.layerFile), ...byPath])] : byPath;
}

/** A test, a spec outside the gates' routes folder, a story, Markdown or a snapshot changes no screen. */
function isIgnoredName(file: string): boolean {
  const name = file.slice(file.lastIndexOf("/") + 1);
  if (file.includes("/__snapshots__/") || /\.md$|\.stories\.[^.]+$/.test(name)) return true;
  return /\.(test|spec)\.[^/]+$/.test(name) && !file.startsWith(ROUTES_DIR);
}

/** The unit of a web file under src/, or null for a file that places no unit (loose in src/, shared, styles, the frame). */
function webUnit(parts: readonly string[]): string | null {
  if (parts.length < 2 || parts[0] === "shared" || parts[0] === "styles") return null;
  if (parts[0] !== "app") return parts[0] ?? null;
  const area = parts[1];
  const own =
    area === "destinations"
      ? parts.length >= 4
      : parts.length >= 3 && (area === "flows" || area === "legacy-routes");
  return own ? unitOf(parts.join("/")) : null;
}

type Verdict = { kind: "ignored" } | { kind: "all" } | { kind: "unit"; unit: string };

/** What one changed file of the repository does to the screens (rules 1 to 3 of the brief, in that order). */
export function classify(file: string): Verdict {
  const inScope = file === "Makefile" || IN_SCOPE.some((prefix) => file.startsWith(prefix));
  if (!inScope || isIgnoredName(file)) return { kind: "ignored" };
  if (!file.startsWith(WEB_SRC)) return { kind: "all" };
  const unit = webUnit(file.slice(WEB_SRC.length).split("/"));
  return unit === null ? { kind: "all" } : { kind: "unit", unit };
}

/** The import specifiers of one source text that name a web file: relative paths and the `@/` alias. */
export function specifiersOf(text: string): string[] {
  return [...text.matchAll(SPECIFIER)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.startsWith("./") || s.startsWith("../") || s.startsWith("@/"));
}

/** The import graph of source files under src/ (`path` relative to src/): the units that each unit imports, as importers. */
export function importersOf(files: readonly { path: string; text: string }[]): Importers {
  const map = new Map<string, Set<string>>();
  for (const { path, text } of files) {
    if (!path.includes("/") || !SOURCE.test(path)) continue;
    const from = unitOf(path);
    for (const spec of specifiersOf(text)) {
      const target = spec.startsWith("@/")
        ? spec.slice(2)
        : posix.normalize(posix.join(posix.dirname(path), spec));
      const to = target.startsWith("..") ? "" : unitOf(target);
      if (to === "" || to === from) continue;
      map.set(to, new Set([...(map.get(to) ?? []), from]));
    }
  }
  return map;
}

/** The import graph of the working tree (CI checks out the head that the run tests): no tests, stories or declarations. */
function readImporters(): Importers {
  const sources = readdirSync(WEB_SRC_FOLDER, { recursive: true })
    .map(String)
    .filter((rel) => SOURCE.test(rel) && !/\.(test|stories)\.|\.d\.ts$|__snapshots__/.test(rel))
    .map((path) => ({ path, text: readFileSync(new URL(path, WEB_SRC_FOLDER), "utf8") }));
  return importersOf(sources);
}

/** The units that a change touches: the changed ones and their importers, not past a hub reached as an importer. */
export function closureOf(changed: ReadonlySet<string>, importers: Importers): Set<string> {
  const touched = new Set(changed);
  const queue = [...changed];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (HUBS.has(next) && !changed.has(next)) continue;
    for (const unit of importers.get(next) ?? [])
      if (!touched.has(unit)) {
        touched.add(unit);
        queue.push(unit);
      }
  }
  return touched;
}

/** The screens that the changed files touch: all of them for a change outside the rules, none for a change with no screen. */
export function touchedScreens(
  files: readonly string[],
  screens: readonly Screen[],
  importers?: Importers,
): { all: boolean; ids: string[] } {
  const everything = { all: true, ids: screens.map((s) => s.id) };
  const changed = new Set<string>();
  for (const file of files) {
    const verdict = classify(file);
    if (verdict.kind === "all") return everything;
    if (verdict.kind === "unit") changed.add(verdict.unit);
  }
  if (changed.size === 0) return { all: false, ids: [] };
  const touched = closureOf(changed, importers ?? readImporters());
  // A screen without a home is touched by every web change (fail safe).
  const ids = screens.filter((s) => homeOf(s)?.some((unit) => touched.has(unit)) ?? true);
  return { all: ids.length === screens.length, ids: ids.map((s) => s.id) };
}

/** The shards of ui-shard for this many touched screens: one per 17 screens, at most MAX_SHARDS, none for none. */
export function shardCount(screens: number): number {
  return Math.min(MAX_SHARDS, Math.ceil(screens / SCREENS_PER_SHARD));
}

/** The matrix of ui-shard as a list: [1, 2, ...] for the shard count, [] for no screen. */
export function shardList(screens: number): number[] {
  return Array.from({ length: shardCount(screens) }, (_, index) => index + 1);
}

/** The output lines of the CI step, `name=value` each (the GitHub output format); ui-screens is empty for every screen. */
export function outputLines(touched: { all: boolean; ids: readonly string[] }): string[] {
  return [
    `ui-screens=${touched.all ? "" : touched.ids.join(",")}`,
    `ui-shards=${JSON.stringify(shardList(touched.ids.length))}`,
    `ui-count=${touched.ids.length}`,
  ];
}

/** The register, read from the checked-in file (the same list as the gates read). */
export function readScreens(): Screen[] {
  return JSON.parse(readFileSync(new URL("../screens.json", import.meta.url), "utf8")) as Screen[];
}

/** `node touched-screens.ts [base-sha]`: no base, or an all-zero base, means every screen; else the diff from the base to HEAD. */
function main(argv: readonly string[]): number {
  const base = argv[0] ?? "";
  const screens = readScreens();
  if (base === "" || /^0+$/.test(base)) {
    process.stdout.write(
      outputLines({ all: true, ids: screens.map((s) => s.id) }).join("\n") + "\n",
    );
    return 0;
  }
  const diff = execFileSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf8" });
  process.stdout.write(
    outputLines(touchedScreens(diff.split("\n").filter(Boolean), screens)).join("\n") + "\n",
  );
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
