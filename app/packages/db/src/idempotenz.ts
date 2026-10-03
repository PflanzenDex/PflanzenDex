import type { Pool } from "pg";
import { mitKonto } from "./mandant.ts";

// Dieselben Formen wie IdempotenzSpeicher in `core` (strukturell gleich; `db` importiert `core` nicht).
export interface IdempotenzSchluessel {
  readonly nutzerId: string;
  readonly operation: string;
  readonly schluessel: string;
}
export type Beginn =
  | { readonly art: "neu" }
  | { readonly art: "wiederholung"; readonly ergebnis: unknown }
  | { readonly art: "laeuft" }
  | { readonly art: "konflikt" };

type Zeile = { fingerabdruck: string; ergebnis: unknown; fertig: boolean };

/**
 * Wiederholungsschutz in PostgreSQL. `beginne` ist atomar: Der Primärschlüssel (Konto, Operation, Schlüssel) lässt
 * von gleichzeitigen Aufrufen genau einen als `neu` durch. Einträge älter als 24 Stunden (Annahme) zählen als frei.
 */
export class IdempotenzPostgres {
  constructor(private readonly pool: Pool) {}

  async beginne(s: IdempotenzSchluessel, fingerabdruck: string): Promise<Beginn> {
    return mitKonto(this.pool, s.nutzerId, async (c) => {
      await c.query(
        `delete from idempotenz where operation = $1 and schluessel = $2 and angelegt_am < now() - interval '24 hours'`,
        [s.operation, s.schluessel],
      );
      const neu = await c.query(
        `insert into idempotenz (konto_id, operation, schluessel, fingerabdruck) values ($1, $2, $3, $4)
         on conflict do nothing`,
        [s.nutzerId, s.operation, s.schluessel, fingerabdruck],
      );
      if (neu.rowCount === 1) return { art: "neu" };
      const r = await c.query<Zeile>(
        `select fingerabdruck, ergebnis, fertig from idempotenz where operation = $1 and schluessel = $2`,
        [s.operation, s.schluessel],
      );
      const z = r.rows[0] as Zeile;
      if (z.fingerabdruck !== fingerabdruck) return { art: "konflikt" };
      return z.fertig ? { art: "wiederholung", ergebnis: z.ergebnis } : { art: "laeuft" };
    });
  }

  async schliesse(s: IdempotenzSchluessel, ergebnis: unknown): Promise<void> {
    await mitKonto(this.pool, s.nutzerId, (c) =>
      c.query(
        `update idempotenz set ergebnis = $3, fertig = true where operation = $1 and schluessel = $2`,
        [s.operation, s.schluessel, JSON.stringify(ergebnis)],
      ),
    );
  }

  async verwerfe(s: IdempotenzSchluessel): Promise<void> {
    await mitKonto(this.pool, s.nutzerId, (c) =>
      c.query(`delete from idempotenz where operation = $1 and schluessel = $2`, [
        s.operation,
        s.schluessel,
      ]),
    );
  }
}
