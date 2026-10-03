import { randomUUID } from "node:crypto";
import type { Fixtures } from "../kern/index.ts";

// Tabellen des Moduls `bestand` (FR-QG-07). Die Art hat keinen Fremdschlüssel, eine beliebige Kennung genügt.
export const FIXTURES_BESTAND: Fixtures = {
  exemplar: () => ({ art_id: randomUUID(), name: "Bogenhanf", gefangen_am: "2026-10-03" }),
};
