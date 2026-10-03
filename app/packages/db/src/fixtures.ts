import type { Pool } from "pg";
import { FIXTURE_ART_ID, FIXTURES_BESTAND } from "./bestand/index.ts";
import { FIXTURES_KATALOG } from "./katalog/index.ts";
import { FIXTURES_KERN, mitKonto, type Fixtures } from "./kern/index.ts";
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
  ...FIXTURES_BESTAND,
};

// Testhilfen für Tabellen eines anderen Moduls (AB-9): Tests eines Moduls schreiben kein SQL auf fremde Tabellen,
// sie rufen diese Hilfen hier auf. Die Rollenvergabe ist im Betrieb Sache des Betreibers (TE-08), nicht der Anwendung.
export const vergibRolle = (pool: Pool, konto: string, rolle: "betreiber" | "pruefer") =>
  pool.query("insert into konto_rolle (konto, rolle) values ($1, $2)", [konto, rolle]);

/** Die Anwendungsrolle darf die Rollentabelle weder lesen noch beschreiben (beides muss mit `permission denied` scheitern). */
export const lesenDerRollentabelle = (pool: Pool, konto: string) =>
  mitKonto(pool, konto, (c) => c.query("select * from konto_rolle"));
export const schreibenInDieRollentabelle = (pool: Pool, konto: string) =>
  mitKonto(pool, konto, (c) =>
    c.query("insert into konto_rolle (konto, rolle) values ($1, 'betreiber')", [konto]),
  );

// Feste Beispielart für Tabellen, die per Fremdschlüssel auf den Katalog zeigen (AB-10, globale Referenztabelle `art`).
// Sie gehört einem eigenen Konto und ist ein privater Vorschlag, sieht also niemand sonst. Idempotent und bleibt stehen:
// ein Konto-Löschen darf wegen `on delete restrict` keine benutzte Art mitnehmen.
const FIXTURE_ART_KONTO = "00000000-0000-4000-8000-00000000fa02";

export async function legeFixtureArtAn(pool: Pool): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("insert into konto (id) values ($1) on conflict do nothing", [
      FIXTURE_ART_KONTO,
    ]);
    await client.query(
      `insert into pruefvorgang (konto_id, objekt_art, objekt_id, status)
       values ($1, 'art', $2, 'vorschlag') on conflict do nothing`,
      [FIXTURE_ART_KONTO, FIXTURE_ART_ID],
    );
    await client.query(
      `insert into art (id, gattung, lateinischer_name, schwierigkeit, standard_stufe, lichtbedarf_lux,
         wachstumsmass, vergeilung_anzeichen, erfolgskriterien, erstellt_von)
       values ($1, 'Fixtureus', 'Fixtureus mandantentest', 1, 2, 100, 'hoehe', 'v', 'e', 'nutzer')
       on conflict do nothing`,
      [FIXTURE_ART_ID],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return FIXTURE_ART_ID;
}

/** Löschen einer Art mit Eigentümerrechten und als Anwendung (AB-9: Tests fremder Module schreiben kein SQL auf `art`). */
export const loescheArt = (pool: Pool, artId: string) =>
  pool.query("delete from art where id = $1", [artId]);
export const loescheArtAlsAnwendung = (pool: Pool, konto: string, artId: string) =>
  mitKonto(pool, konto, (c) => c.query("delete from art where id = $1", [artId]));
export const artExistiert = async (pool: Pool, artId: string) =>
  ((await pool.query("select 1 from art where id = $1", [artId])).rowCount ?? 0) === 1;
