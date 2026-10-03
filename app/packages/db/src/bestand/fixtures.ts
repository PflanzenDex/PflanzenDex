import { randomUUID } from "node:crypto";
import type { FixtureKontext, Fixtures } from "../kern/index.ts";

// Tabellen des Moduls `bestand` (FR-QG-07). Die Art ist ein Fremdschlüssel auf die globale Referenztabelle `art`
// (AB-10): die feste Beispielart legt `legeFixtureArtAn` (db/src/fixtures.ts) vor dem Test an.
export const FIXTURE_ART_ID = "00000000-0000-4000-8000-00000000fa01";
export const FIXTURES_BESTAND: Fixtures = {
  exemplar: () => ({ art_id: FIXTURE_ART_ID, name: "Bogenhanf", gefangen_am: "2026-10-03" }),
};

/**
 * Legt ein Exemplar des Kontos an und liefert seine Kennung. Für Fixtures anderer Module, deren Tabellen auf ein
 * Exemplar verweisen: sie schreiben kein SQL auf `exemplar` (AB-9), sondern rufen das hier auf. Die Art ist die feste
 * Beispielart (`legeFixtureArtAn`); der Name ist zufällig, weil er je Konto eindeutig sein muss.
 */
export async function legeFixtureExemplarAn(k: FixtureKontext): Promise<string> {
  const r = await k.abfrage.query<{ id: string }>(
    "insert into exemplar (konto_id, art_id, name) values ($1, $2, $3) returning id",
    [k.kontoId, FIXTURE_ART_ID, `Fixture ${randomUUID()}`],
  );
  return (r.rows[0] as { id: string }).id;
}
