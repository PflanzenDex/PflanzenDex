// Layer rules for `@/` imports (DS-01, DS-02, DS-42 in docs/guides/reference/design-system.md): ui < shared < modules, and
// modules only through their index. Used by check-design-system.mjs for every import line of a .tsx file.

// Design-system folders that hold no module (FR-QG-23 step 2: shared/ holds ui, patterns, platform, lib and testing;
// step 3: app/ is the composition root, which is no module either, so deep imports into it are not checked for DS-42).
const RESERVED_DIRS = new Set(["app", "components", "shared", "styles"]);
const IMPORT = /(?:from|import)\s*\(?\s*["']@\/([^"']+)["']/;

// The target of an `@/` import: its top folder and the rest below it. shared/data is the former kernel: for these rules it
// is a module of its own, entered through its index (DS-42 as before).
function importTarget(spec) {
  const parts = spec.split("/");
  const kernel = parts[0] === "shared" && parts[1] === "data";
  const [top, ...rest] = kernel ? ["kernel", ...parts.slice(2)] : parts;
  return { top, rest: rest.length > 0 ? rest.join("/") : undefined };
}

// Composites: shared/patterns. The app (app/, formerly components/ and shell/) is above shared and never imported from it.
const isComposite = ({ top, rest }) => top === "shared" && rest?.startsWith("patterns");
const isAbove = ({ top }) => top === "app";
// Pattern files (DS-02): shared/patterns, and the app-shell components (app/frame) with the shell fixtures of the stories,
// which were under components/shared until step 3.
const PATTERN_FILE =
  /^(?:shared\/patterns\/|app\/(?:frame\/(?:app-shell|global-header|mobile-nav-bar|side-nav)|stories\/shell)\/)/;
const isPatternFile = (file) => PATTERN_FILE.test(file);

export function importViolations(file, line) {
  const match = line.match(IMPORT);
  if (match === null) return [];
  const target = importTarget(match[1]);
  const targetIsModule = !RESERVED_DIRS.has(target.top);
  const found = [];
  if (file.startsWith("shared/ui/") && (targetIsModule || isComposite(target) || isAbove(target)))
    found.push("DS-01");
  if (isPatternFile(file) && targetIsModule) found.push("DS-02");
  if (targetIsModule && target.rest !== undefined) found.push("DS-42");
  return found;
}
