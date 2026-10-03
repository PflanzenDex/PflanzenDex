import type { Art } from "../katalog";
import type {
  ArtQuelle,
  ExemplarSpeicher,
  ExemplarWerte,
  ExemplarZeile,
  SollStandortQuelle,
} from "./typen";

/** Eine vollständige Art für Tests von `bestand` (nur Testdaten, kein Produktcode). */
export const testArt = (id: string, extra: Partial<Art> = {}): Art => ({
  id,
  lateinischerName: "Dracaena trifasciata",
  gattung: "Dracaena",
  epitheton: "trifasciata",
  sorte: null,
  deutscherName: "Bogenhanf",
  englischerName: null,
  synonyme: [],
  familieDeutsch: null,
  familieLateinisch: null,
  schwierigkeit: 1,
  standardStufe: 2,
  lichtbedarfLux: 15000,
  ruheVon: null,
  ruheBis: null,
  standortHinweis: null,
  wachstumsmass: "hoehe",
  vergeilungAnzeichen: "Blätter werden schmal.",
  giesshinweis: null,
  substrat: null,
  rueckschnitt: null,
  wuchsHacks: null,
  erfolgskriterien: "Neue Blätter wachsen aufrecht.",
  botanischeStory: null,
  quelle: null,
  pruefstatus: "geprueft",
  erstelltVon: "betreiber",
  eigener: false,
  version: 1,
  ...extra,
});

/** Arten mit Sichtbarkeit je Konto: `nur` begrenzt eine Art auf ein Konto (privater Vorschlag, FR-BES-11). */
export class ArtenStub implements ArtQuelle {
  constructor(private readonly arten: readonly { art: Art; nur?: string }[]) {}

  async finde(nutzerId: string, id: string): Promise<Art | null> {
    return this.arten.find((a) => a.art.id === id && (!a.nur || a.nur === nutzerId))?.art ?? null;
  }
}

/** In-Memory-Adapter nur für Tests; der echte Adapter liegt in `db`. Bekannte Standorte ersetzen den Fremdschlüssel. */
export class ExemplareImSpeicher implements ExemplarSpeicher {
  readonly zeilen: (ExemplarZeile & { nutzerId: string })[] = [];
  schreibzugriffe = 0;

  constructor(private readonly standorte: Readonly<Record<string, readonly string[]>> = {}) {}

  async liste(nutzerId: string): Promise<readonly ExemplarZeile[]> {
    return this.zeilen
      .filter((z) => z.nutzerId === nutzerId)
      .map((z) => {
        const { nutzerId: besitzer, ...zeile } = z;
        void besitzer;
        return zeile;
      });
  }

  async finde(nutzerId: string, id: string): Promise<ExemplarZeile | null> {
    return (await this.liste(nutzerId)).find((z) => z.id === id) ?? null;
  }

  async anlegen(
    nutzerId: string,
    w: ExemplarWerte,
  ): Promise<ExemplarZeile | "name_vergeben" | "standort_unbekannt"> {
    this.schreibzugriffe += 1;
    const vergeben = this.zeilen.some(
      (z) => z.nutzerId === nutzerId && z.name.toLowerCase() === w.name.toLowerCase(),
    );
    if (vergeben) return "name_vergeben";
    if (w.standortId && !this.standorte[nutzerId]?.includes(w.standortId))
      return "standort_unbekannt";
    const zeile: ExemplarZeile = {
      ...w,
      id: `00000000-0000-4000-8000-${String(this.zeilen.length + 1).padStart(12, "0")}`,
      status: w.status ?? "pflanze",
      archiviertAm: null,
      archiviertGrund: null,
    };
    this.zeilen.push({ ...zeile, nutzerId });
    return zeile;
  }

  /** Status vor der Archivierung je Zeile (der echte Adapter hält ihn in einer Spalte). */
  private readonly vorher = new Map<string, ExemplarZeile["status"]>();

  private ersetze(nutzerId: string, id: string, neu: Partial<ExemplarZeile>) {
    const i = this.zeilen.findIndex((z) => z.nutzerId === nutzerId && z.id === id);
    const alt = this.zeilen[i];
    if (!alt) return null;
    this.schreibzugriffe += 1;
    const zeile = { ...alt, ...neu };
    this.zeilen[i] = zeile;
    const { nutzerId: besitzer, ...ohne } = zeile;
    void besitzer;
    return ohne;
  }

  async archivieren(nutzerId: string, id: string, grund: string, datum: string) {
    const z = await this.finde(nutzerId, id);
    if (!z) return "nicht_gefunden" as const;
    if (z.status === "archiviert") return "bereits_archiviert" as const;
    this.vorher.set(id, z.status);
    const r = this.ersetze(nutzerId, id, {
      status: "archiviert",
      archiviertAm: datum,
      archiviertGrund: grund,
    });
    return r as ExemplarZeile;
  }

  async eintopfen(nutzerId: string, id: string) {
    const z = await this.finde(nutzerId, id);
    if (!z) return "nicht_gefunden" as const;
    if (z.status !== "steckling") return "kein_steckling" as const;
    return this.ersetze(nutzerId, id, { status: "pflanze" }) as ExemplarZeile;
  }

  async wiederherstellen(nutzerId: string, id: string) {
    const z = await this.finde(nutzerId, id);
    if (!z) return "nicht_gefunden" as const;
    if (z.status !== "archiviert") return "nicht_archiviert" as const;
    const r = this.ersetze(nutzerId, id, {
      status: this.vorher.get(id) ?? "pflanze",
      archiviertAm: null,
      archiviertGrund: null,
    });
    return r as ExemplarZeile;
  }
}

/** Soll-Standort-Stub: merkt sich die Aufrufe, damit Tests prüfen, was der Port erfährt. */
export class SollStandortStub implements SollStandortQuelle {
  readonly aufrufe: { nutzerId: string; artId: string; heute: string }[] = [];

  readonly wachstumsAufrufe: { nutzerId: string; artId: string }[] = [];

  constructor(
    private readonly antwort: string | null,
    private readonly wachstum: string | null = null,
  ) {}

  async wachstumsStandort(nutzerId: string, art: Art): Promise<string | null> {
    this.wachstumsAufrufe.push({ nutzerId, artId: art.id });
    return this.wachstum;
  }

  async sollStandort(nutzerId: string, art: Art, heute: string): Promise<string | null> {
    this.aufrufe.push({ nutzerId, artId: art.id, heute });
    return this.antwort;
  }
}
