import type { Art, ArtAnlage, ArtName, ArtSpeicher, ArtTreffer, ArtWerte } from "./typen";

const RANG = { lateinisch: 0, deutsch: 1, englisch: 2, synonym: 3 } as const;

type Zeile = Art & { ersteller: string; namen: readonly ArtName[] };

/** In-Memory-Adapter nur für Tests; der echte Adapter liegt in `db`. Sichtbarkeit wie in FR-BES-11. */
export class ArtImSpeicher implements ArtSpeicher {
  readonly zeilen: Zeile[] = [];

  /** Simuliert die Freigabe durch einen Prüfer (BES-10): die Art ist dann für alle sichtbar. */
  freigeben(id: string): void {
    const i = this.zeilen.findIndex((z) => z.id === id);
    const z = this.zeilen[i];
    if (z) this.zeilen[i] = { ...z, pruefstatus: "geprueft" };
  }

  private sichtbar(nutzerId: string): Zeile[] {
    return this.zeilen.filter(
      (z) => z.ersteller === nutzerId || ["kuratiert", "geprueft"].includes(z.pruefstatus),
    );
  }

  private als(nutzerId: string, z: Zeile): Art {
    const { ersteller, namen, ...art } = z;
    void namen;
    return { ...art, eigener: ersteller === nutzerId };
  }

  async suche(nutzerId: string, norm: string | null): Promise<readonly ArtTreffer[]> {
    const treffer: ArtTreffer[] = [];
    for (const z of this.sichtbar(nutzerId)) {
      const passend = z.namen
        .filter((n) => norm === null || n.norm.includes(norm))
        .sort((a, b) => RANG[a.feld] - RANG[b.feld])[0];
      if (norm === null || passend)
        treffer.push({
          ...this.als(nutzerId, z),
          treffer: passend ? { feld: passend.feld, anzeige: passend.anzeige } : null,
        });
    }
    return treffer.sort((a, b) => a.lateinischerName.localeCompare(b.lateinischerName));
  }

  async finde(nutzerId: string, id: string): Promise<Art | null> {
    const z = this.sichtbar(nutzerId).find((x) => x.id === id);
    return z ? this.als(nutzerId, z) : null;
  }

  async anlegen(nutzerId: string, w: ArtWerte, namen: readonly ArtName[]): Promise<ArtAnlage> {
    const schluessel = new Set(namen.filter((n) => n.feld !== "deutsch" && n.feld !== "englisch"));
    const vorhanden = this.sichtbar(nutzerId).find((z) =>
      z.namen.some(
        (n) =>
          (n.feld === "lateinisch" || n.feld === "synonym") &&
          [...schluessel].some((s) => s.norm === n.norm),
      ),
    );
    if (vorhanden) return { art: "dublette", wert: this.als(nutzerId, vorhanden) };
    const id = `00000000-0000-4000-8000-${String(this.zeilen.length + 1).padStart(12, "0")}`;
    const zeile: Zeile = {
      ...w,
      id,
      pruefstatus: "vorschlag",
      erstelltVon: "nutzer",
      eigener: true,
      version: 1,
      ersteller: nutzerId,
      namen,
    };
    this.zeilen.push(zeile);
    return { art: "neu", wert: this.als(nutzerId, zeile) };
  }
}
