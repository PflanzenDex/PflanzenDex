import type { Pool } from "pg";
import { mitKonto } from "../kern/index.ts";

// Dieselben Formen wie die Schnittstellen in `core` (strukturell gleich; `db` importiert `core` nicht).
export interface MessungZeile {
  readonly id: string;
  readonly exemplarId: string;
  readonly datum: string;
  readonly wert: number;
  readonly qualitaet: "gesund" | "vergeilt";
  readonly notiz: string | null;
  readonly bewertungDurch: "halter" | "ki_uebernommen";
}
export type MessungWerte = Omit<MessungZeile, "id">;

// `date` kommt als Text zurück (der Treiber würde ein `Date` in der Zeitzone des Servers bauen, NFR-08) und
// `numeric` als Zahl statt als Text.
const SPALTEN = `id, exemplar_id as "exemplarId", to_char(datum, 'YYYY-MM-DD') as datum, wert::float8 as wert,
  qualitaet, notiz, bewertung_durch as "bewertungDurch"`;

const FREMDSCHLUESSEL = "23503";

/**
 * Adapter für Messungen; jeder Aufruf läuft als Konto des Aufrufers unter den Zeilenregeln (P-04). Das Exemplar hängt
 * über den zusammengesetzten Fremdschlüssel (konto_id, exemplar_id) am eigenen Konto: das Exemplar eines anderen
 * Kontos ist für die Datenbank unbekannt, auch wenn jemand seine Kennung errät.
 */
export class MessungenPostgres {
  constructor(private readonly pool: Pool) {}

  /** Neueste zuerst: nach Datum, bei gleichem Datum die zuletzt erfasste. */
  async liste(nutzerId: string, exemplarId: string): Promise<readonly MessungZeile[]> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<MessungZeile>(
        `select ${SPALTEN} from messung where exemplar_id = $1 order by datum desc, angelegt_am desc, id`,
        [exemplarId],
      ),
    );
    return r.rows;
  }

  /** Eine Anweisung: alles oder nichts. */
  async anlegen(nutzerId: string, w: MessungWerte): Promise<MessungZeile | "exemplar_unbekannt"> {
    try {
      const r = await mitKonto(this.pool, nutzerId, (c) =>
        c.query<MessungZeile>(
          `insert into messung (konto_id, exemplar_id, datum, wert, qualitaet, notiz, bewertung_durch)
           values ($1, $2, $3, $4, $5, $6, $7) returning ${SPALTEN}`,
          [nutzerId, w.exemplarId, w.datum, w.wert, w.qualitaet, w.notiz, w.bewertungDurch],
        ),
      );
      return r.rows[0] as MessungZeile;
    } catch (e) {
      const f = e as { code?: string; constraint?: string };
      if (f.code === FREMDSCHLUESSEL && f.constraint === "messung_exemplar")
        return "exemplar_unbekannt";
      throw e;
    }
  }
}
