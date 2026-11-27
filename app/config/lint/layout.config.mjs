// Single source for the file layout (FR-QG-21). Describes the TARGET layout; what does not
// match yet is listed in layout-baseline.json and only shrinks (FR-QG-22).
const story = "[a-z0-9][a-z0-9-]*";
// One kebab-case word group of a file name (the same pattern as `story`, one star only: ESLint security/detect-unsafe-regex).
const word = story;
export default {
  // The size hint of a module directory (FR-QG-21, d-136 of 2026-11-26, issue 2546): above it `make layout` prints a hint
  // and does not fail (8 since owner decision d-133, issue 2543; 5 before). A per-path rule below is a hard limit (d-133);
  // the fixed limits of the app root, the gate folder, the runbooks and the module folders are README manifests (d-139).
  maxUnits: 8,
  // A folder without a manifest fails above this many units: twice the size hint (d-138). A manifest (README.md
  // frontmatter, LY-1a) sets its own limit, expect.
  failUnits: 16,
  // A directory without a per-path rule that holds this many files of one extension family is an automatic collection:
  // no unit limit, LY-3 still applies (FR-QG-21, d-133).
  autoCollectionMin: 8,
  rootFiles: [
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CLAUDE.md",
    "AGENTS.md",
    "Makefile",
  ],
  rootDirs: ["app", "docs", "tools"],
  // Conventional names that are exempt from kebab-case (LY-3).
  namedFiles: [
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CLAUDE.md",
    "AGENTS.md",
    "Makefile",
    "CODEOWNERS",
    "Dockerfile",
  ],
  // LY-3 exemption (owner decision 2026-10-30, issue #1077): Keycloak reads a login theme's message bundle only under
  // this exact name (messages_<locale>.properties). Only these files are exempt from the name rule; nothing else.
  nameExempt: ["app/config/dev/keycloak-theme/**/messages/messages_*.properties"],
  componentRoots: ["app/packages/web/src"],
  componentExempt: ["main", "routes"],
  // First match wins; "*" is one path segment. A collection has no entry limit but a name pattern (LY-2).
  dirs: [
    // Module roots (FR-QG-21): the `src/` folder holds the modules, and there are more modules than the unit limit, so it
    // has none. A module folder holds its limit in its README manifest (10 feature directories, d-139, issue 2546).
    // A package root (d-133): its tool configuration files (package and lock files, tsconfig, components.json and the
    // *.config.* files of Vite, Vitest, Playwright and ESLint) are no units; LY-3 still checks their names.
    {
      path: "app/packages/*",
      uncounted:
        /^(package(-lock)?\.json|tsconfig[a-z0-9.-]*\.json|components\.json|[a-z0-9.-]+\.config\.(m?js|ts|cjs))$/,
    },
    { path: "app/packages/*/src", maxUnits: Infinity },
    // The flat UI primitives (R3, owner decisions d-132 and d-133, issue 2509): `npx shadcn add <name>` writes `<name>.tsx` into
    // `src/shared/ui`, so this folder is a collection of files with no unit limit, no subfolder and no LY-4 (a flat component is
    // the layout here). A name is a component (`button.tsx`), its story or test (`button.stories.tsx`, `button.test.tsx`), its
    // message table (`button.de.json`), a part or sidecar of it (`<name>.<kind>.ts` and `<name>.<kind>.tsx`: `button.roles.ts`,
    // `form-bar.slot.tsx`, with a test `<name>.<kind>.test.ts(x)`) or a helper module (`layer-scope.ts`). The word groups are
    // kebab-case; a dotted name has one `.<kind>` at most, so a part is never a component of its own for QG-U5.
    {
      path: "app/packages/web/src/shared/ui",
      collection: new RegExp(
        `^${word}(\\.${word})?(\\.(stories|test))?\\.tsx?$|^${word}(\\.${word})?\\.de\\.json$`,
      ),
    },
    // The changelog fragments (US-DEV-06, issue 1486): one JSON file per PR, named by its issue number and a slug. Each
    // file is a unit of its own, so a unit cap would stop the folder after nine PRs; the name pattern (LY-2) is the rule.
    { path: "app/packages/web/src/news/unreleased", collection: /^\d+-[a-z0-9-]+\.json$/ },
    // The gate folder app/tools/check/code (its reason is in its manifest), the runbooks in docs/guides/operations (one per
    // task, looked up by name in an incident, #985) and the module folders hold their limits in README manifests (d-139).
    // One ratchet file per gate (FR-QG-17); every new gate brings its own (issue 1137 added the sixth), so the folder is
    // a collection with a strict name instead of a unit limit.
    { path: "app/config/gates/baselines", collection: /^[a-z0-9-]+-baseline\.json$/ },
    {
      path: "app/packages/db/migrations",
      collection: /^\d{4}_[a-z0-9_]+\.sql$/,
    },
    {
      path: "docs/specs/product",
      collection: /^(\d{2}-[a-z0-9-]+|readme)\.md$/,
    },
    {
      path: "docs/specs/prototype",
      collection: /^(\d{2}-[a-z0-9-]+|readme)\.md$/,
    },
    { path: "docs/adr", collection: /^\d{4}-[a-z0-9-]+\.md$/ },
    {
      path: "docs/guides/principles",
      collection: /^(prin-\d{3}-[a-z0-9-]+|readme)\.md$/,
    },
    {
      path: "docs/records/test-logs",
      collection: new RegExp(`^${story}(\\.(md|txt))?$`),
    },
    {
      path: "docs/records/test-logs/*",
      collection: new RegExp(`^${story}\\.(png|md|txt|json)$`),
    },
    // The spike folders (d-133, issue 2543): `<yyyy-mm-dd>-<topic>` with a kebab-case topic, or te-15-oauth by name. A
    // collection has no unit limit.
    { path: "docs/records/spikes", collection: /^(\d{4}-\d{2}-\d{2}-[a-z0-9-]+|te-15-oauth)$/ },
    // Inside a spike folder: flat kebab-case names with dotted extensions (a dot needs a letter or digit after it, so no
    // nested repetition: ESLint security/detect-unsafe-regex); README.md is the one conventional capital name. A folder
    // inside a spike follows the default unit limit.
    {
      path: "docs/records/spikes/*",
      collection: /^(README\.md|[a-z0-9](?:[a-z0-9-]|\.(?=[a-z0-9]))*)$/,
    },
    // Redesign mockup sources: the canvas's own file names (mixed case such as M-Pflanzen.dc.html) stay as they are.
    { path: "docs/records/design", collection: /^(README\.md|directions|greenhouse)$/ },
    {
      path: "docs/records/design/directions",
      collection: /^([A-Za-z0-9-]+\.dc\.html|canvas\.json)$/,
    },
    {
      path: "docs/records/design/greenhouse",
      collection: /^([A-Za-z0-9-]+\.dc\.html|canvas\.json)$/,
    },
  ],
};
