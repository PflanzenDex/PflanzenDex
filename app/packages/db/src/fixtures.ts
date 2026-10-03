import type { Fixtures } from "./trennung.ts";

// Je Tabelle mit Konto-Kennung ein Beispiel für die übrigen Spalten (ohne Kennung, die setzt der Test).
// Eine neue Tabelle ohne Eintrag hier lässt den generischen Mandantentest scheitern (FR-QG-07).
export const FIXTURES: Fixtures = {
  konto: () => ({}),
  kontodaten: () => ({ email: "test@example.test" }),
};
