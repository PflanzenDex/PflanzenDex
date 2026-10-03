import type { LichtStandort } from "./typen";

export interface Hinweis {
  readonly art: "standort_ohne_zone";
  readonly standortId: string;
  readonly text: string;
  /** P-09: jede Ansicht sagt, was als Nächstes zu tun ist. */
  readonly naechsteHandlung: string;
}

/** Hinweise für US-BES-08 („Hinweise“): Standorte ohne Lichtzone. Die Hinweis-Seite selbst folgt mit BES-08. */
export function standortHinweise(standorte: readonly LichtStandort[]): readonly Hinweis[] {
  return standorte
    .filter((s) => s.lichtzoneId === null)
    .map((s) => ({
      art: "standort_ohne_zone",
      standortId: s.id,
      text: `Der Standort „${s.name}“ hat noch keine Lichtzone.`,
      naechsteHandlung: "Weise dem Standort eine Lichtzone zu.",
    }));
}
