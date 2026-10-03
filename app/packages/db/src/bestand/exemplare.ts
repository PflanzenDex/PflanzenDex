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
}
export type ExemplarWerte = Pick<
  ExemplarZeile,
  "artId" | "name" | "kennzeichen" | "standortId" | "gefangenAm"
>;

// `date` kommt als Text zurück: der Treiber würde daraus ein `Date` in der Zeitzone des Servers machen (NFR-08).
const SPALTEN = `id, art_id as "artId", name, kennzeichen, standort_id as "standortId", status,
  to_char(gefangen_am, 'YYYY-MM-DD') as "gefangenAm"`;

const EINDEUTIG = "23505";
const FREMDSCHLUESSEL = "23503";
const fehler = (e: unknown) => e as { code?: string; constraint?: string };

/**
 * Adapter für Exemplare; jeder Aufruf läuft als Konto des Aufrufers unter den Zeilenregeln (P-04). Der Standort
 * hängt über den zusammengesetzten Fremdschlüssel (konto_id, standort_id) am eigenen Konto. Die Art hat keinen
 * Fremdschlüssel: der Katalog trägt keine Konto-Kennung, AB-10 erlaubt nur `(konto_id, id)`; die Operation in `core`
 * prüft stattdessen, dass das Konto die Art sehen darf, und die Anwendung kann Arten nicht löschen.
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
          `insert into exemplar (konto_id, art_id, name, kennzeichen, standort_id, gefangen_am)
           values ($1, $2, $3, $4, $5, $6) returning ${SPALTEN}`,
          [nutzerId, w.artId, w.name, w.kennzeichen, w.standortId, w.gefangenAm],
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
}
