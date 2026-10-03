import type { Pool } from "pg";
import { mitKonto } from "../kern/index.ts";

// Dieselben Formen wie die Schnittstellen in `core` (strukturell gleich; `db` importiert `core` nicht).
export interface ExemplarZeile {
  readonly id: string;
  readonly artId: string;
  readonly name: string;
  readonly kennzeichen: string | null;
  readonly standortId: string | null;
  readonly status: "pflanze" | "steckling" | "archiviert";
  readonly gefangenAm: string | null;
  readonly archiviertAm: string | null;
  readonly archiviertGrund: string | null;
}
export type ExemplarWerte = Pick<
  ExemplarZeile,
  "artId" | "name" | "kennzeichen" | "standortId" | "gefangenAm"
> & { readonly status?: "pflanze" | "steckling" };

// `date` kommt als Text zurück: der Treiber würde daraus ein `Date` in der Zeitzone des Servers machen (NFR-08).
const SPALTEN = `id, art_id as "artId", name, kennzeichen, standort_id as "standortId", status,
  to_char(gefangen_am, 'YYYY-MM-DD') as "gefangenAm", to_char(archiviert_am, 'YYYY-MM-DD') as "archiviertAm",
  archiviert_grund as "archiviertGrund"`;

const EINDEUTIG = "23505";
const FREMDSCHLUESSEL = "23503";
const fehler = (e: unknown) => e as { code?: string; constraint?: string };

/**
 * Adapter für Exemplare; jeder Aufruf läuft als Konto des Aufrufers unter den Zeilenregeln (P-04). Der Standort
 * hängt über den zusammengesetzten Fremdschlüssel (konto_id, standort_id) am eigenen Konto. Die Art hat keinen
 * Die Art hängt über einen einfachen Fremdschlüssel `exemplar_art` (on delete restrict) am Katalog: `art` ist als
 * globale Referenztabelle registriert (AB-10, ADR 0003 O-2). Die Datenbank garantiert, dass die Art existiert und
 * nicht gelöscht wird; ob das Konto sie sehen darf (freigegeben oder eigener Vorschlag), prüft die Operation in `core`.
 */
export class ExemplarePostgres {
  constructor(private readonly pool: Pool) {}

  async liste(nutzerId: string): Promise<readonly ExemplarZeile[]> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<ExemplarZeile>(`select ${SPALTEN} from exemplar order by lower(name)`),
    );
    return r.rows;
  }

  async finde(nutzerId: string, id: string): Promise<ExemplarZeile | null> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<ExemplarZeile>(`select ${SPALTEN} from exemplar where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  /** Eine Anweisung: alles oder nichts. Die Eindeutigkeit des Namens entscheidet die Datenbank, nicht eine Vorab-Abfrage. */
  async anlegen(
    nutzerId: string,
    w: ExemplarWerte,
  ): Promise<ExemplarZeile | "name_vergeben" | "standort_unbekannt"> {
    try {
      const r = await mitKonto(this.pool, nutzerId, (c) =>
        c.query<ExemplarZeile>(
          `insert into exemplar (konto_id, art_id, name, kennzeichen, standort_id, gefangen_am, status)
           values ($1, $2, $3, $4, $5, $6, $7) returning ${SPALTEN}`,
          [
            nutzerId,
            w.artId,
            w.name,
            w.kennzeichen,
            w.standortId,
            w.gefangenAm,
            w.status ?? "pflanze",
          ],
        ),
      );
      return r.rows[0] as ExemplarZeile;
    } catch (e) {
      if (fehler(e).code === EINDEUTIG && fehler(e).constraint === "exemplar_name_je_konto")
        return "name_vergeben";
      if (fehler(e).code === FREMDSCHLUESSEL && fehler(e).constraint === "exemplar_standort")
        return "standort_unbekannt";
      throw e;
    }
  }

  /**
   * Eine Anweisung: nur ein Steckling wird zur Pflanze (US-BES-04). Pflanzen und archivierte Exemplare bleiben
   * unverändert und melden `kein_steckling`; fremde Exemplare sieht die Zeilenregel nicht.
   */
  async eintopfen(
    nutzerId: string,
    id: string,
  ): Promise<ExemplarZeile | "nicht_gefunden" | "kein_steckling"> {
    const sql = `update exemplar set status = 'pflanze' where id = $1 and status = 'steckling' returning ${SPALTEN}`;
    return this.aendere(nutzerId, { sql, parameter: [id] }, "kein_steckling");
  }

  /**
   * Eine Anweisung: Status, Datum, Grund und der Status von vorher. Nur ein nicht archiviertes Exemplar wird geändert,
   * ein zweites Archivieren lässt Datum und Grund der ersten stehen (P-10). Fremde Exemplare sieht die Zeilenregel nicht.
   */
  async archivieren(
    nutzerId: string,
    id: string,
    grund: string,
    datum: string,
  ): Promise<ExemplarZeile | "nicht_gefunden" | "bereits_archiviert"> {
    const sql = `update exemplar set status_vor_archiv = status, status = 'archiviert', archiviert_am = $2,
         archiviert_grund = $3 where id = $1 and status <> 'archiviert' returning ${SPALTEN}`;
    return this.aendere(nutzerId, { sql, parameter: [id, datum, grund] }, "bereits_archiviert");
  }

  /** Setzt den Status von vor der Archivierung zurück (ohne Angabe: Pflanze) und löscht Datum und Grund. */
  async wiederherstellen(
    nutzerId: string,
    id: string,
  ): Promise<ExemplarZeile | "nicht_gefunden" | "nicht_archiviert"> {
    const sql = `update exemplar set status = coalesce(status_vor_archiv, 'pflanze'), status_vor_archiv = null,
         archiviert_am = null, archiviert_grund = null where id = $1 and status = 'archiviert' returning ${SPALTEN}`;
    return this.aendere(nutzerId, { sql, parameter: [id] }, "nicht_archiviert");
  }

  /** Führt die Änderung aus (`$1` ist die Kennung); ändert sie nichts, entscheidet eine Abfrage zwischen „gibt es nicht“ und `sonst`. */
  private async aendere<S extends string>(
    nutzerId: string,
    anweisung: { sql: string; parameter: readonly unknown[] },
    sonst: S,
  ): Promise<ExemplarZeile | "nicht_gefunden" | S> {
    return mitKonto(this.pool, nutzerId, async (c) => {
      const r = await c.query<ExemplarZeile>(anweisung.sql, [...anweisung.parameter]);
      if (r.rows[0]) return r.rows[0];
      const da = await c.query("select 1 from exemplar where id = $1", [anweisung.parameter[0]]);
      return da.rowCount ? sonst : "nicht_gefunden";
    });
  }
}
