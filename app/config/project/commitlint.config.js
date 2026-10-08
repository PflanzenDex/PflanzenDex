// Commit messages (QG-C1, US-DEV-02): Conventional Commits with scopes from the epics.
// Used by the `commit-msg` hook and for the PR title in CI (the squash turns the title into the commit message).

// Product epics (docs/specs/product/readme.md) and the process epics QG/DEV, lower case.
export const EPIC_SCOPES = [
  "acc",
  "bes",
  "lic",
  "pha",
  "wac",
  "beh",
  "wun",
  "pok",
  "mon",
  "soz",
  "equ",
  "ki",
  "qs",
  "ent",
  "qg",
  "dev",
];
// Technical areas without their own epic: packages, enablers (TE-nn), operations, docs, dependencies, release.
export const TECH_SCOPES = [
  "core",
  "api",
  "web",
  "db",
  "app",
  "te",
  "ops",
  "specs",
  "spike",
  "deps",
  "release",
];

export default {
  extends: ["@commitlint/config-conventional"],
  // Local merge commits (`merge: dev into feat/x`) are not squash results and never land on `dev` like this.
  ignores: [(message) => /^merge[: ]/i.test(message)],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "test",
        "refactor",
        "perf",
        "build",
        "ci",
        "chore",
        "revert",
        "style",
      ],
    ],
    "scope-enum": [2, "always", [...EPIC_SCOPES, ...TECH_SCOPES]],
    "header-max-length": [2, "always", 100],
    // Subjects may start with a capitalized domain term ("Pflegephase from measurement").
    "subject-case": [0],
    "body-max-line-length": [0],
  },
};
