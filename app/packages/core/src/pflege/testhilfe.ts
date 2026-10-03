import type { ArtQuelle, ExemplarSpeicher, ExemplarZeile } from "../bestand";
import type { Art, Wachstumsmass } from "../katalog";
import type { MessungSpeicher, MessungWerte, MessungZeile } from "./typen";

/** Exemplare je Konto (nur Tests von `pflege`, kein Produktcode); jedes hat die Art `art-1`. */
export class ExemplareStub implements Pick<ExemplarSpeicher, "finde"> {
  /** `archiviert` nennt die Kennungen, die archiviert sind (US-BES-07). */
  constructor(
    private readonly besitz: Readonly<Record<string, readonly string[]>>,
    private readonly archiviert: readonly string[] = [],
  ) {}

  async finde(nutzerId: string, id: string): Promise<ExemplarZeile | null> {
    if (!this.besitz[nutzerId]?.includes(id)) return null;
    const weg = this.archiviert.includes(id);
    return {
      id,
      artId: "art-1",
      name: "Bogenhanf",
      kennzeichen: null,
      standortId: null,
      status: weg ? "archiviert" : "pflanze",
      gefangenAm: "2026-10-01",
      archiviertAm: weg ? "2026-10-02" : null,
      archiviertGrund: weg ? "eingegangen" : null,
    };
  }
}

/** Eine einzige Art mit dem gewünschten Wachstumsmaß; `null` heißt „Art nicht sichtbar“. */
export const artStub = (wachstumsmass: Wachstumsmass | null): ArtQuelle => ({
  finde: async () => (wachstumsmass ? ({ id: "art-1", wachstumsmass } as Art) : null),
});

/** In-Memory-Adapter nur für Tests; der echte Adapter liegt in `db`. */
export class MessungenImSpeicher implements MessungSpeicher {
  readonly zeilen: (MessungZeile & { nutzerId: string })[] = [];
  schreibzugriffe = 0;

  constructor(private readonly besitz: Readonly<Record<string, readonly string[]>>) {}

  async liste(nutzerId: string, exemplarId: string): Promise<readonly MessungZeile[]> {
    return this.zeilen
      .map((z, i) => ({ z, i }))
      .filter(({ z }) => z.nutzerId === nutzerId && z.exemplarId === exemplarId)
      .sort((a, b) => b.z.datum.localeCompare(a.z.datum) || b.i - a.i)
      .map(({ z: { nutzerId: besitzer, ...zeile } }) => {
        void besitzer;
        return zeile;
      });
  }

  async anlegen(nutzerId: string, w: MessungWerte): Promise<MessungZeile | "exemplar_unbekannt"> {
    this.schreibzugriffe += 1;
    if (!this.besitz[nutzerId]?.includes(w.exemplarId)) return "exemplar_unbekannt";
    const zeile: MessungZeile = { ...w, id: `m${this.zeilen.length + 1}` };
    this.zeilen.push({ ...zeile, nutzerId });
    return zeile;
  }
}
