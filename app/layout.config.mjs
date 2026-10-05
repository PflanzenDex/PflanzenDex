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
  componentRoots: ["app/packages/web/src"],
  componentExempt: ["main", "routes"],
  // First match wins; "*" is one path segment. A collection has no entry limit but a name pattern (LY-2).
  dirs: [
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
    // The same collections at their current paths, until the docs move (FR-QG-23) renames them.
    // Without these, every new ADR, test log, principle or spec file would fail the ratchet.
    { path: "Docs/decisions", collection: /^\d{4}-[a-z0-9-]+\.md$/ },
    { path: "Docs/principles", collection: /^(PRIN-\d{3}-[a-z0-9-]+|README)\.md$/ },
    { path: "Docs/PRODUCT-SPECS", collection: /^(\d{2}-[A-Za-z0-9-]+|README)\.md$/ },
    { path: "Docs/PLANT-SYSTEM-SPECS", collection: /^(\d{2}-[A-Za-z0-9-]+|README)\.md$/ },
    { path: "Docs/test-logs", collection: new RegExp(`^${story}(\\.(md|txt))?$`) },
    {
      path: "Docs/test-logs/*",
      collection: new RegExp(`^${story}\\.(png|md|txt|json)$`),
    },
  ],
};
