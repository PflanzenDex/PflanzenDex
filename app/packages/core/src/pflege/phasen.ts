import { fehler, fehlgeschlagen, heuteLokal, istZeitzone, ok, type Ergebnis } from "../kern";
import type { ArtQuelle, ExemplarSpeicher } from "../bestand";
import { pflegephase, type Pflegephase } from "./phase";

export interface PhasenAbhaengigkeiten {
  readonly exemplare: Pick<ExemplarSpeicher, "liste">;
  readonly arten: ArtQuelle;
  /** Die Uhr kommt von außen, damit „heute“ prüfbar ist (NFR-08). */
  readonly uhr: () => Date;
}

/** Eine Zeile der Phasenliste (US-PHA-01). Alles hier ist abgeleitet, nichts davon wird gespeichert. */
export interface PhasenZeile {
  readonly exemplarId: string;
  readonly name: string;
  readonly artId: string;
  readonly phase: Pflegephase;
  /** Kennung des heutigen Standorts des Exemplars; `null` = unbekannt. */
  readonly standortId: string | null;
  /**
   * Soll-Standort der Phase. Er gehört zum Pflegeprofil des Halters (FR-PHA-02, BES-09), das es noch nicht gibt:
   * bis dahin immer `null` = unbekannt, nie erfunden (P-08).
   */
  readonly sollStandortId: string | null;
}

/**
 * Phase je aktivem Exemplar (US-PHA-01): gelistet wird, was Pflanze ist (nicht Steckling, nicht archiviert, FR-PHA-04)
 * und dessen Art einen Ruhephasen-Zeitraum hat. `heute` ist das Datum in `zeitzone`. Sortiert nach Name.
 */
export async function pflegephasenListe(
  deps: PhasenAbhaengigkeiten,
  nutzerId: string,
  zeitzone: unknown,
): Promise<Ergebnis<readonly PhasenZeile[]>> {
  if (!istZeitzone(zeitzone))
    return fehlgeschlagen(
      fehler("eingabe.ungueltig", { details: [{ feld: "zeitzone", code: "eingabe.ungueltig" }] }),
    );
  const heute = heuteLokal(deps.uhr(), zeitzone);
  const aktive = (await deps.exemplare.liste(nutzerId)).filter((z) => z.status === "pflanze");
  const artIds = [...new Set(aktive.map((z) => z.artId))];
  const arten = new Map(
    await Promise.all(
      artIds.map(async (id) => [id, await deps.arten.finde(nutzerId, id)] as const),
    ),
  );
  const zeilen: PhasenZeile[] = [];
  for (const z of aktive) {
    const art = arten.get(z.artId);
    if (!art?.ruheVon || !art.ruheBis) continue;
    zeilen.push({
      exemplarId: z.id,
      name: z.name,
      artId: z.artId,
      phase: pflegephase(art.ruheVon, art.ruheBis, heute),
      standortId: z.standortId,
      sollStandortId: null,
    });
  }
  return ok(zeilen.sort((a, b) => a.name.localeCompare(b.name, "de")));
}
