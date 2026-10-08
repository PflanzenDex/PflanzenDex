// Release (US-DEV-06, FR-QG-14, QG-R1): SemVer from Conventional Commits, only on `main`, only after a green CI.
// Result: git tag `vX.Y.Z` and a GitHub release with notes. Nothing is committed back to `main`
// (rulesets block direct pushes; the version comes from the tag, ADR 0002).

// `0.x` until the first release for outside users (stage 2): a breaking change only bumps the minor version.
// Remove this rule in a dedicated PR to release 1.0.0.
const BEFORE_1_0 = [{ breaking: true, release: "minor" }];

const SECTIONS = [
  { type: "feat", section: "Features" },
  { type: "fix", section: "Bug fixes" },
  { type: "perf", section: "Performance" },
  { type: "revert", section: "Reverts" },
  { type: "refactor", section: "Refactoring", hidden: true },
  { type: "docs", section: "Documentation", hidden: true },
  { type: "test", section: "Tests", hidden: true },
  { type: "build", section: "Build", hidden: true },
  { type: "ci", section: "CI", hidden: true },
  { type: "chore", section: "Chores", hidden: true },
  { type: "style", section: "Style", hidden: true },
];

export default {
  // Fixed instead of derived from the local `origin`: local remote URLs differ between machines.
  repositoryUrl: "https://github.com/PflanzenDex/PflanzenDex.git",
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        // `docs:`, `chore:`, `ci:` etc. trigger no release (FR-DEV-09). Renovate opens runtime dependency updates
        // as `fix(deps)` (patch release) and tooling updates as `chore(deps)` (no release).
        releaseRules: BEFORE_1_0,
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      { preset: "conventionalcommits", presetConfig: { types: SECTIONS } },
    ],
    [
      "@semantic-release/github",
      { successCommentCondition: false, failCommentCondition: false, releasedLabels: false },
    ],
  ],
};
