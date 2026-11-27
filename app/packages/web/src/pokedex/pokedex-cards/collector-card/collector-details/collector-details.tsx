import { Fragment } from "react";
import type { CollectorCard as Card } from "@pflanzendex/core";
import { CardSection } from "@/shared/patterns/display/card/card-more/card-more";
import {
  FoldNext,
  missingText,
} from "@/shared/patterns/responsive/responsive-table/fact-grid/fact-grid";
import { DisclosureSummary } from "@/shared/ui/more-help.disclosure-summary";
import { Badge } from "@/shared/ui/badge";
import { SCIENTIFIC, germanNameOf } from "@/shared/species-name/species-name";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../collector-card.de.json";
import { appRarityLine, rarityLines, type CardLine } from "../rarity-note/rarity-note";
import { SourcesRow } from "../sources-row/sources-row";

const t = texts(table);

/** The genus count and the rarity lines of the card; every unknown value says "unbekannt" (P-08). */
function lines(c: Card): CardLine[] {
  return [
    {
      key: "genus",
      unknown: c.genusSpeciesCount === null,
      node: (
        <span className="text-sm">
          {c.genusSpeciesCount === null
            ? t("genus.unknown")
            : t("genus.known", { count: c.genusSpeciesCount })}
        </span>
      ),
    },
    ...rarityLines(c.natureRarity),
    appRarityLine(c.appRarity),
  ];
}

/**
 * The known lines, then the unknown ones folded into one line "n Angaben fehlen" that opens them, with the next step beside
 * it (US-QS-24, P-08, P-09, P-10). The sheet scrolls, so the fold is no help for a short screen any more, but it keeps the
 * known facts first.
 */
function Lines({ all }: { all: readonly CardLine[] }) {
  const known = all.filter((l) => !l.unknown);
  const folded = all.filter((l) => l.unknown);
  return (
    <div className="grid min-w-0 gap-1">
      {known.map((l) => (
        <Fragment key={l.key}>{l.node}</Fragment>
      ))}
      {folded.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <details className="min-w-0">
            <DisclosureSummary className="inline-flex w-auto gap-2 rounded-sm tabular-nums">
              {missingText(folded.length)}
            </DisclosureSummary>
            <span className="grid gap-1 pb-1 text-foreground">
              {folded.map((l) => (
                <Fragment key={l.key}>{l.node}</Fragment>
              ))}
            </span>
          </details>
          <span aria-hidden="true">·</span>
          <FoldNext />
        </div>
      ) : null}
    </div>
  );
}

/**
 * What "Mehr" opens on a collector card (US-POK-01, US-QS-15, owner decision d-160): the scientific name where the German name
 * titles the sheet, the short text, the genus count with the rarity in nature and in PflanzenDéx, the badge of a
 * species-poor genus, the number of plants, and the section "Quellen" (the sources of the text and the rarity; the credit of
 * the picture stays under the picture, SG-PHOTO-03). The sheet scrolls under its title.
 */
export function CollectorDetails({ card: c }: { card: Card }) {
  const german = germanNameOf(c.species, c.germanName);
  return (
    <div className="grid min-w-0 gap-4">
      {german !== null && <p className={cn("m-0 text-sm italic", SCIENTIFIC)}>{c.species}</p>}
      <CardSection title={t("section.description")}>
        <p className="m-0 text-sm">{c.summary ?? t("noSummary")}</p>
      </CardSection>
      <CardSection title={t("section.attributes")}>
        <Lines all={lines(c)} />
        {c.speciesPoor && (
          <Badge variant="default" className="w-fit max-w-full whitespace-normal">
            {t("poor")}
          </Badge>
        )}
        {c.specimenCount > 1 && (
          <span className="text-sm text-muted-foreground">
            {t("specimens", { count: c.specimenCount })}
          </span>
        )}
      </CardSection>
      <SourcesRow card={c} />
    </div>
  );
}
