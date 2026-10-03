import type { Verteilung } from "@pflanzendex/core";

/** Antwort von `GET /exemplare/verteilung` für ein Konto ohne Zonen (nur Tests, kein Produktcode). */
export const LEERE_VERTEILUNG: { verteilung: Verteilung } = {
  verteilung: {
    zonen: [],
    duennste: [],
    nichtGezaehlt: { stecklingslicht: 0, archiviert: 0, zoneUnbekannt: 0 },
    hinweis: {
      text: "Es gibt keine Lichtzone für erwachsene Pflanzen.",
      naechsteHandlung: "Lege unter „Licht“ mindestens zwei Lichtzonen an.",
    },
  },
};
