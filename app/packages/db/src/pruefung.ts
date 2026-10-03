import type { Pool } from "pg";
import { mitKonto } from "./mandant.ts";

// Dieselben Formen wie die Schnittstelle PruefungSpeicher in `core` (strukturell gleich; `db` importiert `core` nicht).
export type Rolle = "betreiber" | "pruefer";
export type Pruefstatus =
  "vorschlag" | "ki_ungeprueft" | "kuratiert" | "geprueft" | "zurueckgewiesen";
export interface Pruefvorgang {
  readonly id: string;
  readonly erstellerId: string;
  readonly objektArt: string;
  readonly objektId: string;
  readonly status: Pruefstatus;
  readonly grund: string | null;
  readonly geprueftVon: string | null;
}

const SPALTEN = `id, konto_id as "erstellerId", objekt_art as "objektArt", objekt_id as "objektId",
  status, grund, geprueft_von as "geprueftVon"`;

/** Adapter für den Prüfstatus; jeder Aufruf läuft als Konto des Aufrufers unter den Zeilenregeln (P-04). */
export class PruefungPostgres {
  constructor(private readonly pool: Pool) {}

  async rollen(nutzerId: string): Promise<readonly Rolle[]> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<{ rolle: Rolle }>("select rollen_des_kontos() as rolle"),
    );
    return r.rows.map((z) => z.rolle);
  }

  async anlegen(
    nutzerId: string,
    v: { objektArt: string; objektId: string; status: Pruefstatus },
  ): Promise<Pruefvorgang | "vorhanden"> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<Pruefvorgang>(
        `insert into pruefvorgang (konto_id, objekt_art, objekt_id, status) values ($1, $2, $3, $4)
         on conflict (objekt_art, objekt_id) do nothing returning ${SPALTEN}`,
        [nutzerId, v.objektArt, v.objektId, v.status],
      ),
    );
    return r.rows[0] ?? "vorhanden";
  }

  async finde(nutzerId: string, id: string): Promise<Pruefvorgang | null> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<Pruefvorgang>(`select ${SPALTEN} from pruefvorgang where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  async entscheide(
    nutzerId: string,
    id: string,
    status: "geprueft" | "zurueckgewiesen",
    grund: string | null,
  ): Promise<Pruefvorgang | null> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<Pruefvorgang>(
        `update pruefvorgang set status = $2, grund = $3 where id = $1 returning ${SPALTEN}`,
        [id, status, grund],
      ),
    );
    return r.rows[0] ?? null;
  }
}
