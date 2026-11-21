import type { ReactNode } from "react";
import type { AppRarity, CollectorCard as Card } from "@pflanzendex/core";

type Rarity = Card["natureRarity"];

const CATEGORY_TEXT = {
  LC: "nicht gefährdet",
  NT: "potenziell gefährdet",
  VU: "gefährdet",
  EN: "stark gefährdet",
  CR: "vom Aussterben bedroht",
  EW: "in der Natur ausgestorben",
  EX: "ausgestorben",
  DD: "Datenlage unzureichend",
} as const;

/** One line of the card; `unknown` lines fold on a short screen (US-QS-24, issue 1154). */
export type CardLine = { key: string; node: ReactNode; unknown: boolean };

/**
 * Rarity in nature (US-POK-13): IUCN category and GBIF occurrence count, each labelled "in der Natur"; their source and
 * retrieval date are in the sources row at the foot of the card (US-QS-32); unknown says "unbekannt" (P-08). Information
 * only: no sorting, badge or reward, and the note on a threatened species neither blocks nor promotes anything.
 */
export function rarityLines(rarity: Rarity): CardLine[] {
  const { iucn, occurrences, threatened } = rarity;
  const lines: CardLine[] = [
    iucn === null
      ? {
          key: "iucn",
          unknown: true,
          node: <span className="text-sm">In der Natur: Gefährdung unbekannt</span>,
        }
      : {
          key: "iucn",
          unknown: false,
          node: (
            <span className="text-sm">{`In der Natur: ${CATEGORY_TEXT[iucn.category]} (${iucn.category})`}</span>
          ),
        },
    occurrences === null
      ? {
          key: "occurrences",
          unknown: true,
          node: <span className="text-sm">In der Natur: Fundmeldungen unbekannt</span>,
        }
      : {
          key: "occurrences",
          unknown: false,
          node: (
            <span className="text-sm">{`In der Natur: ${occurrences.count.toLocaleString("de-DE")} Fundmeldungen (GBIF)`}</span>
          ),
        },
  ];
  if (threatened)
    lines.push({
      key: "threatened",
      unknown: false,
      node: (
        <span className="text-sm text-muted-foreground">
          Hinweis: Diese Art gilt in der Natur als bedroht.
        </span>
      ),
    });
  return lines;
}

/** "40 %", but never "0 %" for a species somebody owns and never "100 %" while one account lacks it. */
function percentText(r: AppRarity): string {
  if (r.owners > 0 && r.percent === 0) return "weniger als 1 %";
  if (r.owners < r.participants && r.percent === 100) return "mehr als 99 %";
  return `${r.percent} %`;
}

/**
 * Rarity in PflanzenDex (US-POK-14): the share of the participating accounts that own the species, always with its
 * basis; unknown without participants (P-08). Information only, labelled "in PflanzenDex", never merged with the
 * rarity in nature.
 */
export function appRarityLine(r: AppRarity | null): CardLine {
  if (r === null)
    return {
      key: "app",
      unknown: true,
      node: <span className="text-sm">In PflanzenDéx: unbekannt (noch kein Konto nimmt teil)</span>,
    };
  const accounts = r.participants === 1 ? "Konto" : "Konten";
  return {
    key: "app",
    unknown: false,
    node: (
      <span className="text-sm">{`In PflanzenDéx: ${percentText(r)} (${r.owners} von ${r.participants} ${accounts})`}</span>
    ),
  };
}
