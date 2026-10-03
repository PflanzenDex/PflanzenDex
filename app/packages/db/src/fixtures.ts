import { FIXTURES_KATALOG } from "./katalog/index.ts";
import { FIXTURES_KERN, type Fixtures } from "./kern/index.ts";
import { FIXTURES_KONTO } from "./konto/index.ts";
import { FIXTURES_LICHT } from "./licht/index.ts";

// Je Tabelle mit Konto-Kennung ein Beispiel für die übrigen Spalten (ohne Kennung, die setzt der Test).
// Die Einträge liegen im jeweiligen Modul; hier werden sie gesammelt. Eine neue Tabelle ohne Eintrag
// lässt den generischen Mandantentest scheitern (FR-QG-07).
export const FIXTURES: Fixtures = {
  ...FIXTURES_KERN,
  ...FIXTURES_KONTO,
  ...FIXTURES_KATALOG,
  ...FIXTURES_LICHT,
};
