// Release (US-DEV-06, FR-QG-14, QG-R1): SemVer aus Conventional Commits, nur auf `main`, nur nach grüner CI.
// Ergebnis: Git-Tag `vX.Y.Z` und GitHub-Release mit Notizen. Es wird nichts zurück nach `main` committet
// (Rulesets verbieten Direkt-Pushes; die Version kommt aus dem Tag, ADR 0002).

// `0.x` bis zur ersten Freigabe für Fremde (Stufe 2): Ein Breaking Change hebt nur die Minor-Version.
// Für 1.0.0 wird diese Zeile bewusst in einem eigenen PR entfernt.
const VOR_1_0 = [{ breaking: true, release: "minor" }];

const SECTIONS = [
  { type: "feat", section: "Neu" },
  { type: "fix", section: "Behoben" },
  { type: "perf", section: "Schneller" },
  { type: "revert", section: "Zurückgenommen" },
  { type: "refactor", section: "Intern", hidden: true },
  { type: "docs", section: "Dokumentation", hidden: true },
  { type: "test", section: "Tests", hidden: true },
  { type: "build", section: "Build", hidden: true },
  { type: "ci", section: "CI", hidden: true },
  { type: "chore", section: "Pflege", hidden: true },
  { type: "style", section: "Formatierung", hidden: true },
];

export default {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        // `docs:`, `chore:`, `ci:` usw. erzeugen keinen Release (FR-DEV-09). Laufzeit-Abhängigkeiten kommen
        // von Renovate als `fix(deps)` und erzeugen damit einen Patch, Entwicklungswerkzeuge als `chore(deps)` nicht.
        releaseRules: VOR_1_0,
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
