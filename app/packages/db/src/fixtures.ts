import type { Pool } from "pg";
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
