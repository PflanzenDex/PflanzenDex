import { Fragment, useState } from "react";
import type { CollectorCard as Card } from "@pflanzendex/core";
import {
  CardPicture,
  PICTURE_HEIGHT_CAP,
} from "@/shared/patterns/display/card/card-picture/card-picture";
import { largeText } from "@/shared/patterns/display/card/card-picture/large-text";
import { useIsShort } from "@/shared/patterns/responsive/pager/card-page-size";
import {
  FoldNext,
  missingText,
} from "@/shared/patterns/responsive/responsive-table/fact-grid/fact-grid";
import { Badge } from "@/shared/ui/badge";
import { SpeciesName } from "@/shared/species-name/species-name";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { catchText } from "./catch-text";
import table from "./collector-card.de.json";
import { SourcesRow } from "./sources-row/sources-row";
import { WikipediaSource } from "./wikipedia-source/wikipedia-source";
import { appRarityLine, rarityLines, type CardLine } from "./rarity-note/rarity-note";
import { DisclosureSummary } from "@/shared/ui/more-help.disclosure-summary";

const t = texts(table);

const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

/**
 * Difficulty as stars with a text alternative every screen reader exposes (US-QS-14, WCAG 1.1.1): the stars are
 * hidden from assistive technology, the visually hidden `label` is read instead of an aria-label on a plain element.
 */
export function DifficultyStars(props: { level: number; label: string }) {
  return (
    <>
      <span aria-hidden="true">{stars(props.level)}</span>
      <span className="sr-only">{props.label}</span>
    </>
  );
}

/**
 * The picture with its credit directly under it (US-QS-32, F-0133, SG-PHOTO-01 to SG-PHOTO-03): the shared card picture
 * keeps a 4:3 box at every width and text size, with room reserved before the image comes; the image is a link to its
 * source, not a copy (P-05); without one the drawn placeholder stands in, never an emoji. An uncaught card keeps its
 * picture in grey (owner answer Q-91, the one exception to SG-COLOR-07). At the normal text size the box takes the height
 * cap of the other cards; at large text the card takes its own height and the picture is not capped.
 */
function Picture(props: { card: Card; large: boolean }) {
  const c = props.card;
  return (
    <div className={cn("min-w-0", c.state === "missing" && "[&_img]:grayscale")}>
      <CardPicture
        src={c.imageUrl}
        alt={t("card.imageAlt", { species: c.species })}
        boxClassName={props.large ? undefined : PICTURE_HEIGHT_CAP}
        credit={
          c.imageUrl === null ? undefined : (
            <WikipediaSource
              label={t("card.pictureCredit")}
              sourceUrl={c.sourceUrl}
              shown
              className="inline-flex min-h-11 items-center text-muted-foreground"
            />
          )
        }
      />
    </div>
  );
}

/** Genus count, difficulty and light zone; every unknown value says "unbekannt" (P-08). */
function factLines(c: Card): CardLine[] {
  return [
    {
      key: "genus",
      unknown: c.genusSpeciesCount === null,
      node: (
        <span className="text-sm text-muted-foreground">
          {c.genusSpeciesCount === null
            ? "Gattung: Artenzahl unbekannt"
            : `Gattung: ${c.genusSpeciesCount} Arten`}
        </span>
      ),
    },
    c.difficulty === null
      ? {
          key: "difficulty",
          unknown: true,
          node: <span className="text-sm">Schwierigkeit unbekannt</span>,
        }
      : {
          key: "difficulty",
          unknown: false,
          node: (
            <span className="text-sm">
              <DifficultyStars level={c.difficulty} label={`Schwierigkeit ${c.difficulty} von 3`} />
            </span>
          ),
        },
    {
      key: "zone",
      unknown: c.lightZone === null,
      node: (
        <span className="text-sm">
          {c.lightZone === null ? "Lichtzone unbekannt" : `Lichtzone ${c.lightZone}`}
        </span>
      ),
    },
  ];
}

/**
 * The facts and rarity lines of a card. On a short screen (at most 700 px high) the unknown ones fold into one line
 * "n Angaben fehlen" that opens them (US-QS-24, owner decision 2026-11-02, issue 1154): one card then fits a 360 x 640
 * phone. Elsewhere every line shows as before.
 */
function Lines(props: { lines: readonly CardLine[] }) {
  const short = useIsShort();
  const shown = short ? props.lines.filter((l) => !l.unknown) : props.lines;
  const folded = short ? props.lines.filter((l) => l.unknown) : [];
  return (
    <>
      {shown.map((l) => (
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
    </>
  );
}

/**
 * Collector card of one species (US-POK-01). Caught is colored, missing keeps name and text visible and shows the
 * image in grey. A species-poor genus gets a badge, a caught one also a rarity frame.
 */
export function CollectorCard(props: { card: Card }) {
  const c = props.card;
  // The text size is read once when the card appears, as the decks do (US-QS-21).
  const [large] = useState(largeText);
  const caught = c.state === "caught";
  const rare = caught && c.speciesPoor;
  return (
    <li
      data-state={c.state}
      {...(rare ? { "data-rarity": "" } : {})}
      className={cn(
        "animate-list-in grid min-w-0 grid-cols-1 content-start gap-1 break-words rounded-card bg-card p-3 text-card-foreground shadow-elevation-1",
        rare && "border-2 border-warning-border",
      )}
    >
      <Picture card={c} large={large} />
      <span className="text-sm text-muted-foreground">{`#${String(c.number).padStart(3, "0")}`}</span>
      <SpeciesName scientific={c.species} german={c.germanName} tooltip={c.germanNameFull} />
      {/* Two lines on a short screen; the full text is in the species profile (issue 1154). */}
      <span className="text-sm [@media(max-height:700px)]:line-clamp-2">
        {c.summary ?? "Keine Beschreibung vorhanden."}
      </span>
      <Lines
        lines={[...factLines(c), ...rarityLines(c.natureRarity), appRarityLine(c.appRarity)]}
      />
      <span className="flex flex-wrap gap-1.5">
        <Badge variant={caught ? "default" : "outline"}>
          {c.caughtDate === null ? "noch nicht gefangen" : catchText(c.caughtDate)}
        </Badge>
        {c.speciesPoor && <Badge variant="default">Artenarm</Badge>}
      </span>
      {c.specimenCount > 1 && (
        <span className="text-muted-foreground">{`${c.specimenCount} Pflanzen`}</span>
      )}
      <SourcesRow card={c} />
    </li>
  );
}
