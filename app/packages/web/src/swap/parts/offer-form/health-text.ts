import type { OfferMode, OfferPreview, OfferType } from "@pflanzendex/core";

export const TYPE_TEXT: Record<OfferType, string> = {
  cutting: "Steckling",
  plant: "Pflanze",
  offshoot: "Ableger",
};
export const MODE_TEXT: Record<OfferMode, string> = { swap: "Tauschen", give_away: "Verschenken" };

/** Health details as the dialog and the list show them: open treatment, or reason and date of the last one (US-SOZ-08). */
export const healthText = (h: OfferPreview["health"]): string =>
  h.treatmentOpen
    ? "Behandlung offen"
    : h.lastTreated
      ? `Zuletzt behandelt: ${h.lastTreated.reason}, ${h.lastTreated.doneAt.split("-").reverse().join(".")}`
      : "Keine Behandlung bekannt";
