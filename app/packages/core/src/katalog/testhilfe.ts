import type { Pruefstatus, Pruefvorgang, PruefungSpeicher, Rolle } from "./typen";

/** In-Memory-Adapter nur für Tests; der echte Adapter liegt in `db`. */
export class PruefungImSpeicher implements PruefungSpeicher {
  readonly zeilen: Pruefvorgang[] = [];
  constructor(private readonly rollenJeNutzer: Record<string, Rolle[]> = {}) {}

  async rollen(nutzerId: string): Promise<readonly Rolle[]> {
    return this.rollenJeNutzer[nutzerId] ?? [];
  }

  async anlegen(
    nutzerId: string,
    v: { objektArt: string; objektId: string; status: Pruefstatus },
  ): Promise<Pruefvorgang | "vorhanden"> {
    if (this.zeilen.some((z) => z.objektArt === v.objektArt && z.objektId === v.objektId)) {
      return "vorhanden";
    }
    const nr = String(this.zeilen.length).padStart(12, "0");
    const zeile: Pruefvorgang = {
      id: `00000000-0000-4000-8000-${nr}`,
      erstellerId: nutzerId,
      ...v,
      grund: null,
      geprueftVon: v.status === "kuratiert" ? nutzerId : null,
    };
    this.zeilen.push(zeile);
    return zeile;
  }

  async finde(nutzerId: string, id: string): Promise<Pruefvorgang | null> {
    const pruefer = (await this.rollen(nutzerId)).length > 0;
    return this.zeilen.find((z) => z.id === id && (pruefer || z.erstellerId === nutzerId)) ?? null;
  }

  async entscheide(
    nutzerId: string,
    id: string,
    status: "geprueft" | "zurueckgewiesen",
    grund: string | null,
  ): Promise<Pruefvorgang | null> {
    const i = this.zeilen.findIndex((z) => z.id === id);
    const alt = this.zeilen[i];
    if (!alt) return null;
    const neu = { ...alt, status, grund, geprueftVon: nutzerId };
    this.zeilen[i] = neu;
    return neu;
  }
}
