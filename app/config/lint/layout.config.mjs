// Single source for the file layout (FR-QG-21). Describes the TARGET layout; what does not
// match yet is listed in layout-baseline.json and only shrinks (FR-QG-22).
const story = "[a-z0-9][a-z0-9-]*";
export default {
  maxUnits: 5,
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
    // has none; a module holds up to 10 feature directories (starting value, assumption), inside a feature 5 applies.
    // The app root: package.json, package-lock.json, eslint.config.js (ESLint finds it only here), packages, tools, config.
    { path: "app", maxUnits: 6 },
    { path: "app/packages/*/src", maxUnits: Infinity },
    { path: "app/packages/*/src/*", maxUnits: 10 },
    // The gate scripts: one folder per gate (US-QG-07 added db-indexes as the sixth, FR-QG-26 the UI text rule as the
    // seventh: a language rule fits none of the other folders, FR-QG-12 the constants gate as the eighth (issue 1138):
    // literal repetition of domain values is its own gate); a ninth needs a new reason.
    { path: "app/tools/check/code", maxUnits: 8 },
    // One runbook per operational task, looked up by name in an incident; folding them into one file hides them
    // (#985, US-QG-07). 10 is a starting value (assumption); an eleventh needs a new reason or subfolders.
    { path: "docs/guides/operations", maxUnits: 10 },
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
