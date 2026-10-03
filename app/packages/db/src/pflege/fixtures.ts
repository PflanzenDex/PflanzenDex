import { legeFixtureExemplarAn } from "../bestand/index.ts";
import type { Fixtures } from "../kern/index.ts";

// Tabellen des Moduls `pflege` (FR-QG-07). Die Messung gehört zu einem Exemplar desselben Kontos.
export const FIXTURES_PFLEGE: Fixtures = {
  messung: async (k) => ({
    exemplar_id: await legeFixtureExemplarAn(k),
    datum: "2026-10-03",
    wert: 12.5,
  }),
};
