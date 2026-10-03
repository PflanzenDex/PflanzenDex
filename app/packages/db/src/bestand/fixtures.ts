import { randomUUID } from "node:crypto";
import type { FixtureKontext, Fixtures } from "../kern/index.ts";

// Tabellen des Moduls `bestand` (FR-QG-07). Die Art hat keinen Fremdschlüssel, eine beliebige Kennung genügt.
export const FIXTURES_BESTAND: Fixtures = {
  exemplar: () => ({ art_id: randomUUID(), name: "Bogenhanf", gefangen_am: "2026-10-03" }),
};

/**
 * Legt ein Exemplar des Kontos an und liefert seine Kennung. Für Fixtures anderer Module, deren Tabellen auf ein
 * Exemplar verweisen: sie schreiben kein SQL auf `exemplar` (AB-9), sondern rufen das hier auf. Der Name ist zufällig,
 * weil er je Konto eindeutig sein muss.
 */
export async function legeFixtureExemplarAn(k: FixtureKontext): Promise<string> {
  const r = await k.abfrage.query<{ id: string }>(
    "insert into exemplar (konto_id, art_id, name) values ($1, $2, $3) returning id",
    [k.kontoId, randomUUID(), `Fixture ${randomUUID()}`],
  );
  return (r.rows[0] as { id: string }).id;
}
