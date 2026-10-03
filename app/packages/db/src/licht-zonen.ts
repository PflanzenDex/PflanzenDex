import type { Pool } from "pg";
import { mitKonto } from "./mandant.ts";

// Dieselben Formen wie die Schnittstellen in `core` (strukturell gleich; `db` importiert `core` nicht).
export interface Lichtzone {
  readonly id: string;
  readonly name: string;
  readonly luxDecke: number;
  readonly ppfd: number | null;
  readonly reihenfolge: number;
}
export interface ZonenWerte {
  readonly name: string;
  readonly luxDecke: number;
  readonly ppfd: number | null;
  readonly reihenfolge: number | null;
}

const SPALTEN = `id, name, lux_decke as "luxDecke", ppfd, reihenfolge`;
/** PostgreSQL-Fehlercodes: eindeutiger Wert verletzt, Fremdschlüssel verletzt. */
export const EINDEUTIG = "23505";
export const FREMDSCHLUESSEL = "23503";

export const fehlercode = (e: unknown): string | undefined => (e as { code?: string }).code;

/** Adapter für Lichtzonen; jeder Aufruf läuft als Konto des Aufrufers unter den Zeilenregeln (P-04). */
export class ZonenPostgres {
  constructor(private readonly pool: Pool) {}

  async liste(nutzerId: string): Promise<readonly Lichtzone[]> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<Lichtzone>(`select ${SPALTEN} from lichtzone order by reihenfolge, lower(name)`),
    );
    return r.rows;
  }

  async anlegen(nutzerId: string, w: ZonenWerte): Promise<Lichtzone | "name_vergeben"> {
    try {
      const r = await mitKonto(this.pool, nutzerId, (c) =>
        c.query<Lichtzone>(
          `insert into lichtzone (konto_id, name, lux_decke, ppfd, reihenfolge)
           values ($1, $2, $3, $4, coalesce($5, (select least(coalesce(max(reihenfolge), 0) + 1, 999) from lichtzone)))
           returning ${SPALTEN}`,
          [nutzerId, w.name, w.luxDecke, w.ppfd, w.reihenfolge],
        ),
      );
      return r.rows[0] as Lichtzone;
    } catch (e) {
      if (fehlercode(e) === EINDEUTIG) return "name_vergeben";
      throw e;
    }
  }

  async aendern(
    nutzerId: string,
    id: string,
    w: ZonenWerte,
  ): Promise<Lichtzone | "name_vergeben" | "nicht_gefunden"> {
    try {
      const r = await mitKonto(this.pool, nutzerId, (c) =>
        c.query<Lichtzone>(
          `update lichtzone set name = $2, lux_decke = $3, ppfd = $4, reihenfolge = coalesce($5, reihenfolge)
           where id = $1 returning ${SPALTEN}`,
          [id, w.name, w.luxDecke, w.ppfd, w.reihenfolge],
        ),
      );
      return r.rows[0] ?? "nicht_gefunden";
    } catch (e) {
      if (fehlercode(e) === EINDEUTIG) return "name_vergeben";
      throw e;
    }
  }

  /** Der Fremdschlüssel von `standort` ist der Rückfall, falls zwischen Prüfung und Löschen eine Nutzung entstand. */
  async loeschen(
    nutzerId: string,
    id: string,
  ): Promise<"geloescht" | "nicht_gefunden" | "in_benutzung"> {
    try {
      const r = await mitKonto(this.pool, nutzerId, (c) =>
        c.query("delete from lichtzone where id = $1", [id]),
      );
      return r.rowCount === 1 ? "geloescht" : "nicht_gefunden";
    } catch (e) {
      if (fehlercode(e) === FREMDSCHLUESSEL) return "in_benutzung";
      throw e;
    }
  }
}
