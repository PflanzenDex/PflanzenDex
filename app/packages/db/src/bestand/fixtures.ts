import type { Fixtures } from "../kern/index.ts";

// Tabellen des Moduls `bestand` (FR-QG-07). Die Art ist ein Fremdschlüssel auf die globale Referenztabelle `art`
// (AB-10): die feste Beispielart legt `legeFixtureArtAn` (db/src/fixtures.ts) vor dem Test an.
export const FIXTURE_ART_ID = "00000000-0000-4000-8000-00000000fa01";
export const FIXTURES_BESTAND: Fixtures = {
  exemplar: () => ({ art_id: FIXTURE_ART_ID, name: "Bogenhanf", gefangen_am: "2026-10-03" }),
};
