// Commit-Nachrichten (QG-C1, US-DEV-02): Conventional Commits, Scopes aus den Epics.
// Gilt für den `commit-msg`-Hook und für den PR-Titel in der CI (er wird beim Squash zur Commit-Nachricht).

// Produkt-Epics (Docs/PRODUKT-SPECS/README.md) und Prozess-Epics QG/DEV, kleingeschrieben.
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
// Technische Bereiche ohne eigenes Epic: Pakete, Enabler (TE-nn), Betrieb, Doku, Abhängigkeiten, Release.
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
  // Lokale Merge-Commits (`merge: dev in feat/x`) sind kein Squash-Ergebnis und landen nie so auf `dev`.
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
    // Deutsche Betreffzeilen beginnen oft mit einem Substantiv („Phase aus Messung ableiten").
    "subject-case": [0],
    "body-max-line-length": [0],
  },
};
