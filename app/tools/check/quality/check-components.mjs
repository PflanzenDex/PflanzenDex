// `make components-check` (US-DEV-05, issue 2510): warns about the shared web components that have no story or no line in the
// component inventory of docs/guides/reference/design-system.md. It only warns: the exit code is 0 whatever it finds (E-30,
// no new gate; `make gates` and `make ci` stay the definition of done). Everything it reads comes from the code and the doc (P-07).
//   component   <name>.tsx in shared/ui, shared/patterns, shared/lists or shared/feedback, at any depth. A name with a further
//               dot (<name>.stories.tsx, <name>.test.tsx, <name>.slot.tsx, <name>.test-helpers.tsx ...) is no component.
//   story       <name>.stories.tsx in the same folder as <name>.tsx, or any *.stories.tsx in a parent folder up to its shared root
//               (inclusive): a parent folder's story covers the components below it (owner decision d-143, US-DEV-05).
//   inventory   a table row of the doc (a line that starts with |) that names the component in backticks: its folder
//               (`shared/ui/button`, folder-per-component layout only), its file (`shared/ui/button/button.tsx`, or the flat
//               `shared/ui/button.tsx`) or its PascalCase name (`Button`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../shared/entry-point.mjs";

// Folders below src/ that hold shared components: the folders of the component inventory plus lists and feedback.
const COMPONENT_DIRS = ["shared/ui", "shared/patterns", "shared/lists", "shared/feedback"];
const INVENTORY_DOC = "docs/guides/reference/design-system.md";

// One name without a dot: no story, test, slot, guard, parts or helper file.
const COMPONENT_FILE = /^[^.]+\.tsx$/;

// Every file below `dir`, as paths relative to src (`rel` is the path of `dir` relative to src).
function filesUnder(dir, rel) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return filesUnder(path.join(dir, entry.name), `${rel}/${entry.name}`);
    return entry.isFile() ? [`${rel}/${entry.name}`] : [];
  });
}

// The story next to a component file, relative to src.
const storyOf = (rel) =>
  `${path.posix.dirname(rel)}/${path.posix.basename(rel, ".tsx")}.stories.tsx`;

// Any stories file, relative to src (`x.stories.tsx`, `x.scrolling.stories.tsx` ...).
const STORY_FILE = /\.stories\.tsx$/;

// The folders above a component's own folder, nearest first, up to and including its shared root (shared/ui ...). A flat
// component sits in its root, so it has none: only its own <name>.stories.tsx counts for it, as before.
function parentFolders(rel) {
  const root = COMPONENT_DIRS.find((dir) => rel.startsWith(`${dir}/`));
  const folders = [];
  let dir = path.posix.dirname(rel);
  while (dir !== root && dir.startsWith(`${root}/`)) {
    dir = path.posix.dirname(dir);
    folders.push(dir);
  }
  return folders;
}

// A component has a story when its own <name>.stories.tsx is next to it, or when a folder above it (up to its shared root)
// holds a stories file. `storyFolders` are the folders that hold a stories file.
function hasStory(rel, files, storyFolders) {
  return files.has(storyOf(rel)) || parentFolders(rel).some((dir) => storyFolders.has(dir));
}

// The name as the inventory writes it: `object-row` is `ObjectRow`.
const pascalName = (stem) => stem.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

// The backticked names of the table rows of the doc. A trailing slash is dropped: `shared/ui/button/` is `shared/ui/button`.
export function inventoryNames(markdown) {
  const names = new Set();
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    for (const [, name] of line.matchAll(/`([^`]+)`/g)) names.add(name.replace(/\/$/, ""));
  }
  return names;
}

// The keys under which one component can appear in the inventory: its file, its PascalCase name and, when it sits in a folder
// of its own name (folder per component), that folder. A flat file has no folder key, because its folder holds many components.
function inventoryKeys(rel) {
  const stem = path.posix.basename(rel, ".tsx");
  const keys = [rel, pascalName(stem)];
  if (path.posix.basename(path.posix.dirname(rel)) === stem) keys.push(path.posix.dirname(rel));
  return keys;
}

// A missing doc is an empty inventory: every component is then listed, which is a warning and not a crash.
function readDoc(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

// The components of the web package at webDir and their gaps, as paths relative to src (sorted):
// { components, noStory, noInventory }.
export function check({ webDir, inventoryFile }) {
  const src = path.join(webDir, "src");
  const files = new Set(COMPONENT_DIRS.flatMap((dir) => filesUnder(path.join(src, dir), dir)));
  const components = [...files]
    .filter((rel) => COMPONENT_FILE.test(path.posix.basename(rel)))
    .sort();
  const storyFolders = new Set(
    [...files].filter((rel) => STORY_FILE.test(rel)).map((rel) => path.posix.dirname(rel)),
  );
  const names = inventoryNames(readDoc(inventoryFile));
  return {
    components,
    noStory: components.filter((rel) => !hasStory(rel, files, storyFolders)),
    noInventory: components.filter((rel) => !inventoryKeys(rel).some((key) => names.has(key))),
  };
}

// One warning line per gap: the missing stories first, then the missing inventory lines.
export function warnings({ noStory, noInventory }) {
  return [
    ...noStory.map((rel) => `${rel} has no stories file in its folder or a parent folder`),
    ...noInventory.map(
      (rel) => `${rel} has no line in ${INVENTORY_DOC} (component inventory, section 4.4)`,
    ),
  ];
}

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_PATHS = {
  webDir: path.join(app, "packages/web"),
  inventoryFile: path.join(app, "..", INVENTORY_DOC),
};

// Prints the warnings and the summary of one run and returns the result (undefined when the check did not run). It never
// fails: warnings only, so the command exits 0 whatever it finds (US-DEV-05).
export function report(paths = DEFAULT_PATHS) {
  let result;
  try {
    result = check(paths);
  } catch (error) {
    // A broken check must not fail the build either: the warning says that it did not run.
    console.warn(`warning: components-check did not run (${error.message})`);
    return undefined;
  }
  for (const line of warnings(result)) console.warn(`warning: ${line}`);
  console.log(
    `components-check: ${result.components.length} shared components, ${result.noStory.length} without a story, ` +
      `${result.noInventory.length} without an inventory line. Warnings only, exit 0 (US-DEV-05).`,
  );
  return result;
}

if (isEntryPoint(import.meta.url)) report();
