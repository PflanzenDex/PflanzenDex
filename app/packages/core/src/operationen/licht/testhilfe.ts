import type {
  LichtStandort,
  LichtStandortSpeicher,
  Lichtzone,
  StandortWerte,
  ZonenNutzer,
  ZonenNutzung,
  ZonenSpeicher,
  ZonenWerte,
} from "./typen";

const kennung = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const gleich = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** In-Memory-Adapter nur für Tests; der echte Adapter liegt in `db`. Konten sind getrennt (P-04). */
export class LichtImSpeicher {
  readonly zonen: (Lichtzone & { nutzerId: string })[] = [];
  readonly standorte: (LichtStandort & { nutzerId: string })[] = [];
  private zaehler = 0;

  listeZonen(nutzerId: string): readonly Lichtzone[] {
    return this.zonen
      .filter((z) => z.nutzerId === nutzerId)
      .sort((a, b) => a.reihenfolge - b.reihenfolge);
  }
  listeStandorte(nutzerId: string): readonly LichtStandort[] {
    return this.standorte.filter((s) => s.nutzerId === nutzerId);
  }

  zonenAdapter(): ZonenSpeicher {
    return {
      liste: async (n) => this.listeZonen(n),
      anlegen: async (n, w) => this.zoneAnlegen(n, w),
      aendern: async (n, id, w) => this.zoneAendern(n, id, w),
      loeschen: async (n, id) => this.zoneLoeschen(n, id),
    };
  }

  standortAdapter(): LichtStandortSpeicher {
    return {
      liste: async (n) => this.listeStandorte(n),
      anlegen: async (n, w) => this.standortAnlegen(n, w),
      aendern: async (n, id, w) => this.standortAendern(n, id, w),
    };
  }

  private zoneAnlegen(nutzerId: string, w: ZonenWerte): Lichtzone | "name_vergeben" {
    if (this.zonen.some((z) => z.nutzerId === nutzerId && gleich(z.name, w.name)))
      return "name_vergeben";
    const eigene = this.listeZonen(nutzerId);
    const reihenfolge = w.reihenfolge ?? Math.max(0, ...eigene.map((z) => z.reihenfolge)) + 1;
    const zeile = { id: kennung(++this.zaehler), nutzerId, ...w, reihenfolge };
    this.zonen.push(zeile);
    return zeile;
  }

  private zoneAendern(
    nutzerId: string,
    id: string,
    w: ZonenWerte,
  ): Lichtzone | "name_vergeben" | "nicht_gefunden" {
    const i = this.zonen.findIndex((z) => z.id === id && z.nutzerId === nutzerId);
    const alt = this.zonen[i];
    if (!alt) return "nicht_gefunden";
    if (this.zonen.some((z) => z.nutzerId === nutzerId && z.id !== id && gleich(z.name, w.name)))
      return "name_vergeben";
    const neu = { ...alt, ...w, reihenfolge: w.reihenfolge ?? alt.reihenfolge };
    this.zonen[i] = neu;
    return neu;
  }

  private zoneLoeschen(
    nutzerId: string,
    id: string,
  ): "geloescht" | "nicht_gefunden" | "in_benutzung" {
    const i = this.zonen.findIndex((z) => z.id === id && z.nutzerId === nutzerId);
    if (i < 0) return "nicht_gefunden";
    if (this.standorte.some((s) => s.lichtzoneId === id)) return "in_benutzung";
    this.zonen.splice(i, 1);
    return "geloescht";
  }

  private zoneVorhanden(nutzerId: string, id: string | null): boolean {
    return id === null || this.zonen.some((z) => z.id === id && z.nutzerId === nutzerId);
  }

  private standortAnlegen(
    nutzerId: string,
    w: StandortWerte,
  ): LichtStandort | "name_vergeben" | "zone_unbekannt" {
    if (this.standorte.some((s) => s.nutzerId === nutzerId && gleich(s.name, w.name)))
      return "name_vergeben";
    if (!this.zoneVorhanden(nutzerId, w.lichtzoneId)) return "zone_unbekannt";
    const zeile = { id: kennung(++this.zaehler), nutzerId, ...w };
    this.standorte.push(zeile);
    return zeile;
  }

  private standortAendern(
    nutzerId: string,
    id: string,
    w: StandortWerte,
  ): LichtStandort | "name_vergeben" | "nicht_gefunden" | "zone_unbekannt" {
    const i = this.standorte.findIndex((s) => s.id === id && s.nutzerId === nutzerId);
    const alt = this.standorte[i];
    if (!alt) return "nicht_gefunden";
    if (
      this.standorte.some((s) => s.nutzerId === nutzerId && s.id !== id && gleich(s.name, w.name))
    )
      return "name_vergeben";
    if (!this.zoneVorhanden(nutzerId, w.lichtzoneId)) return "zone_unbekannt";
    const neu = { ...alt, ...w };
    this.standorte[i] = neu;
    return neu;
  }

  /** Nutzungsquelle „Standorte“, wie sie `db` liefert. */
  standortNutzung(): ZonenNutzung {
    return {
      nutzer: async (n, zoneId) =>
        this.listeStandorte(n)
          .filter((s) => s.lichtzoneId === zoneId)
          .map((s): ZonenNutzer => ({ art: "standort", id: s.id, name: s.name })),
    };
  }
}

/** Fake für die noch fehlenden Quellen (Exemplare, Arten): nennt feste Nutzer je Zone. */
export const festeNutzung = (nutzer: readonly ZonenNutzer[]): ZonenNutzung => ({
  nutzer: async () => nutzer,
});
