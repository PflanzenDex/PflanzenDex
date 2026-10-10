import type { SwapSide } from "@pflanzendex/core";

export const STATUS_TEXT: Record<SwapSide["status"], string> = {
  requested: "Angefragt",
  accepted: "Zugesagt",
  handed_over: "Übergeben",
  declined: "Abgelehnt",
  canceled: "Abgebrochen",
  withdrawn: "Zurückgezogen",
};

/** Why the system ended a swap on its own (P-10: nothing disappears without a reason). */
export const CAUSE_TEXT = {
  already_given: "Schon vergeben",
  friendship_ended: "Ihr seid nicht mehr befreundet",
  offer_withdrawn: "Das Angebot wurde zurückgezogen",
} as const;

export const swapTitle = (s: SwapSide): string =>
  s.speciesGerman ?? s.speciesLatin ?? "Art unbekannt";
