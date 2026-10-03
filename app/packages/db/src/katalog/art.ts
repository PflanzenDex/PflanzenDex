import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { mitKonto } from "../kern/index.ts";

// Dieselben Formen wie die Schnittstellen in `core` (strukturell gleich; `db` importiert `core` nicht).
export type NamensFeld = "lateinisch" | "deutsch" | "englisch" | "synonym";
export interface ArtName {
  readonly feld: NamensFeld;
  readonly anzeige: string;
  readonly norm: string;
}
export interface ArtWerte {
  readonly lateinischerName: string;
  readonly gattung: string;
  readonly epitheton: string | null;
  readonly sorte: string | null;
  readonly deutscherName: string | null;
  readonly englischerName: string | null;
  readonly synonyme: readonly string[];
  readonly familieDeutsch: string | null;
  readonly familieLateinisch: string | null;
  readonly schwierigkeit: number;
  readonly standardStufe: number;
  readonly lichtbedarfLux: number;
  readonly ruheVon: string | null;
  readonly ruheBis: string | null;
  readonly standortHinweis: string | null;
  readonly wachstumsmass: "hoehe" | "rosettendurchmesser" | "trieblaenge";
  readonly vergeilungAnzeichen: string;
  readonly giesshinweis: string | null;
  readonly substrat: string | null;
  readonly rueckschnitt: string | null;
  readonly wuchsHacks: string | null;
  readonly erfolgskriterien: string;
  readonly botanischeStory: string | null;
  readonly quelle: string | null;
}
export interface Art extends ArtWerte {
  readonly id: string;
  readonly pruefstatus:
    "vorschlag" | "ki_ungeprueft" | "kuratiert" | "geprueft" | "zurueckgewiesen";
  readonly erstelltVon: "betreiber" | "pruefer" | "nutzer";
  readonly eigener: boolean;
  readonly version: number;
}
export interface ArtTreffer extends Art {
  readonly treffer: { readonly feld: NamensFeld; readonly anzeige: string } | null;
}
export type ArtAnlage = { readonly art: "neu" | "dublette"; readonly wert: Art };

/** Spalte je Feld (ohne Synonyme: die liegen in `art_name`). */
const SPALTE: Record<Exclude<keyof ArtWerte, "synonyme">, string> = {
  lateinischerName: "lateinischer_name",
  gattung: "gattung",
  epitheton: "epitheton",
  sorte: "sorte",
  deutscherName: "deutscher_name",
  englischerName: "englischer_name",
  familieDeutsch: "familie_deutsch",
  familieLateinisch: "familie_lateinisch",
  schwierigkeit: "schwierigkeit",
  standardStufe: "standard_stufe",
  lichtbedarfLux: "lichtbedarf_lux",
  ruheVon: "ruhe_von",
  ruheBis: "ruhe_bis",
  standortHinweis: "standort_hinweis",
  wachstumsmass: "wachstumsmass",
  vergeilungAnzeichen: "vergeilung_anzeichen",
  giesshinweis: "giesshinweis",
  substrat: "substrat",
  rueckschnitt: "rueckschnitt",
  wuchsHacks: "wuchs_hacks",
  erfolgskriterien: "erfolgskriterien",
  botanischeStory: "botanische_story",
  quelle: "quelle",
};
const FELDER = Object.keys(SPALTE) as (keyof typeof SPALTE)[];

// Status und Eigentum liefern Funktionen mit Eigentümerrechten (Migration 0005): die Prüfliste verbirgt fremde Vorgänge.
const AUSWAHL = `a.id, ${FELDER.map((f) => `a.${SPALTE[f]} as "${f}"`).join(", ")},
  coalesce((select array_agg(n.anzeige order by n.anzeige) from art_name n
             where n.art_id = a.id and n.feld = 'synonym'), '{}') as synonyme,
  art_status(a.id) as pruefstatus, a.erstellt_von as "erstelltVon", art_eigen(a.id) as eigener, a.version`;

const maske = (norm: string) => `%${norm.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * Adapter für den Artenkatalog; jeder Aufruf läuft als Konto des Aufrufers unter den Zeilenregeln: sichtbar sind
 * eigene Vorschläge und freigegebene Arten (FR-BES-11, P-04). Ändern und Löschen gibt es für die Anwendung nicht.
 */
export class ArtPostgres {
  constructor(private readonly pool: Pool) {}

  async suche(nutzerId: string, norm: string | null): Promise<readonly ArtTreffer[]> {
    const r = await mitKonto(this.pool, nutzerId, (c) =>
      c.query<Art & { feld: NamensFeld | null; anzeige: string | null }>(
        `select ${AUSWAHL}, t.feld, t.anzeige from art a
           left join lateral (
             select n.feld, n.anzeige from art_name n
              where n.art_id = a.id and $1::text is not null and n.norm like $1::text
              order by array_position(array['lateinisch','deutsch','englisch','synonym'], n.feld) limit 1) t on true
          where $1::text is null or t.feld is not null
          order by a.lateinischer_name limit 50`,
        [norm === null ? null : maske(norm)],
      ),
    );
    return r.rows.map(({ feld, anzeige, ...art }) => ({
      ...art,
      treffer: feld && anzeige ? { feld, anzeige } : null,
    }));
  }

  async finde(nutzerId: string, id: string): Promise<Art | null> {
    return mitKonto(this.pool, nutzerId, (c) => lade(c, id));
  }

  /** Dublettenprüfung, Prüfvorgang, Art und Namen in einer Transaktion: alles oder nichts (FR-BES-03). */
  async anlegen(nutzerId: string, w: ArtWerte, namen: readonly ArtName[]): Promise<ArtAnlage> {
    return mitKonto(this.pool, nutzerId, async (c) => {
      const schluessel = namen.filter((n) => n.feld === "lateinisch" || n.feld === "synonym");
      const dublette = await c.query<{ id: string }>(
        `select n.art_id as id from art_name n
          where n.feld in ('lateinisch', 'synonym') and n.norm = any($1) limit 1`,
        [schluessel.map((n) => n.norm)],
      );
      const vorhanden = await lade(c, dublette.rows[0]?.id);
      if (vorhanden) return { art: "dublette", wert: vorhanden };
      const id = randomUUID();
      await c.query(
        `insert into pruefvorgang (konto_id, objekt_art, objekt_id, status) values ($1, 'art', $2, 'vorschlag')`,
        [nutzerId, id],
      );
      const spalten = FELDER.map((f) => SPALTE[f]);
      await c.query(
        `insert into art (id, erstellt_von, ${spalten.join(", ")})
         values ($1, 'nutzer', ${spalten.map((_, i) => `$${i + 2}`).join(", ")})`,
        [id, ...FELDER.map((f) => w[f])],
      );
      await c.query(
        `insert into art_name (art_id, feld, anzeige, norm)
         select $1, * from unnest($2::text[], $3::text[], $4::text[])`,
        [id, namen.map((n) => n.feld), namen.map((n) => n.anzeige), namen.map((n) => n.norm)],
      );
      return { art: "neu", wert: (await lade(c, id)) as Art };
    });
  }
}

async function lade(c: PoolClient, id: string | undefined): Promise<Art | null> {
  if (!id) return null;
  const r = await c.query<Art>(`select ${AUSWAHL} from art a where a.id = $1`, [id]);
  return r.rows[0] ?? null;
}
