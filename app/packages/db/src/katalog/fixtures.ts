import { randomUUID } from "node:crypto";
import type { Fixtures } from "../kern/index.ts";

// Tabellen des Moduls `katalog` (FR-QG-07).
export const FIXTURES_KATALOG: Fixtures = {
  pruefvorgang: () => ({ objekt_art: "art", objekt_id: randomUUID(), status: "vorschlag" }),
};
