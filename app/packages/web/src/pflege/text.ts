import type { LichtStandort, Pflegephase } from "@pflanzendex/core";

/** P-08: Was fehlt, heißt „unbekannt“ und wird nie mit einem Wert gefüllt. */
export const UNBEKANNT = "unbekannt";

export const PHASENTEXT: Record<Pflegephase, string> = {
  ruhe: "Ruhephase",
  wachstum: "Wachstumsphase",
};

export const standortText = (standorte: readonly LichtStandort[], id: string | null): string =>
  id === null ? UNBEKANNT : (standorte.find((s) => s.id === id)?.name ?? UNBEKANNT);
