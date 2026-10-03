import type { Pool } from "pg";
import { EINDEUTIG, FREMDSCHLUESSEL, fehlercode } from "./licht-zonen.ts";
import { mitKonto } from "./mandant.ts";

export type StandortArt = "innen" | "aussen";
export interface LichtStandort {
  readonly id: string;
  readonly name: string;
  readonly lichtzoneId: string | null;
  readonly art: StandortArt;
}
export interface StandortWerte {
  readonly name: string;
  readonly lichtzoneId: string | null;
  readonly art: StandortArt;
}
export interface ZonenNutzer {
  readonly art: "standort" | "exemplar" | "art";
  readonly id: string;
  readonly name: string;
}

const SPALTEN = `id, name, lichtzone_id as "lichtzoneId", art`;

/**
 * Adapter für Standorte. Der zusammengesetzte Fremdschlüssel (konto_id, lichtzone_id) verhindert, dass ein Standort
 * auf die Zone eines anderen Kontos zeigt (der Fremdschlüssel-Test sieht auch Zeilen, die die Zeilenregel verbirgt).
 */
export class StandortePostgres {
  constructor(private readonly pool: Pool) {}

  async liste(nutzerId: string): Promise<readonly LichtStandort[]> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<LichtStandort>(`select ${SPALTEN} from standort order by lower(name)`),
    );
    return r.rows;
  }

  async anlegen(
    nutzerId: string,
    w: StandortWerte,
  ): Promise<LichtStandort | "name_vergeben" | "zone_unbekannt"> {
    try {
      const r = await mitKonto(this.pool, nutzerId, (c) =>
        c.query<LichtStandort>(
          `insert into standort (konto_id, name, lichtzone_id, art) values ($1, $2, $3, $4) returning ${SPALTEN}`,
          [nutzerId, w.name, w.lichtzoneId, w.art],
        ),
      );
      return r.rows[0] as LichtStandort;
    } catch (e) {
      return this.uebersetze(e);
    }
  }

  async aendern(
    nutzerId: string,
    id: string,
    w: StandortWerte,
  ): Promise<LichtStandort | "name_vergeben" | "nicht_gefunden" | "zone_unbekannt"> {
    try {
      const r = await mitKonto(this.pool, nutzerId, (c) =>
        c.query<LichtStandort>(
          `update standort set name = $2, lichtzone_id = $3, art = $4 where id = $1 returning ${SPALTEN}`,
          [id, w.name, w.lichtzoneId, w.art],
        ),
      );
      return r.rows[0] ?? "nicht_gefunden";
    } catch (e) {
      return this.uebersetze(e);
    }
  }

  private uebersetze(e: unknown): "name_vergeben" | "zone_unbekannt" {
    if (fehlercode(e) === EINDEUTIG) return "name_vergeben";
    if (fehlercode(e) === FREMDSCHLUESSEL) return "zone_unbekannt";
    throw e;
  }

  /** Nutzungsquelle für „Zone löschen“ (Port ZonenNutzung in core): die Standorte der Zone. */
  async nutzer(nutzerId: string, lichtzoneId: string): Promise<readonly ZonenNutzer[]> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<ZonenNutzer>(
        `select 'standort' as art, id, name from standort where lichtzone_id = $1 order by lower(name)`,
        [lichtzoneId],
      ),
    );
    return r.rows;
  }
}
