import { Fragment } from "react";
import type { CollectorCard as Card } from "@pflanzendex/core";
import { useIsShort } from "@/shared/patterns/responsive/pager/card-page-size";
import {
  FoldNext,
  missingText,
} from "@/shared/patterns/responsive/responsive-table/fact-grid/fact-grid";
import { Badge } from "@/shared/ui/display/badge/badge";
import { cn } from "@/shared/lib/utils";
import { catchText } from "./catch-text";
import { appRarityLine, rarityLines, type CardLine } from "./rarity-note/rarity-note";

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

/** The image is a link to its source, not a copy (P-05); without one a neutral sprout stands in. */
function Picture(props: { card: Card }) {
  const c = props.card;
  if (c.imageUrl === null)
    return (
      <span aria-hidden="true" className="text-4xl">
        🌱
      </span>
    );
  return (
    <img
      src={c.imageUrl}
      alt={`Bild von ${c.species}`}
      loading="lazy"
      className={cn(
        // 80 px instead of 128 on a short screen, so one card fits a 360 x 640 phone (issue 1154).
        "h-32 w-full rounded-tile object-cover [@media(max-height:700px)]:h-20",
        c.state === "missing" && "grayscale",
      )}
    />
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
            <summary className="inline-flex min-h-[44px] cursor-pointer items-center rounded-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {missingText(folded.length)}
            </summary>
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
 * Source and license of Wikipedia content (US-QS-06, FR-POK-07): a link when the source is known; when text or image are
 * shown without one, the source and license are still named, as text (P-08). Without Wikipedia content: nothing.
 */
export function WikipediaSource(props: {
  label: string;
  sourceUrl: string | null;
  shown: boolean;
  className?: string;
}) {
  const text = `${props.label}: Wikipedia (CC BY-SA)`;
  if (props.sourceUrl !== null)
    return (
      <a
        href={props.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("text-sm underline", props.className)}
      >
        {text}
      </a>
    );
  if (!props.shown) return null;
  return <span className="text-sm text-muted-foreground">{`${text}, Link unbekannt`}</span>;
}

/**
 * Collector card of one species (US-POK-01). Caught is colored, missing keeps name and text visible and shows the
 * image in grey. A species-poor genus gets a badge, a caught one also a rarity frame.
 */
export function CollectorCard(props: { card: Card }) {
  const c = props.card;
  const caught = c.state === "caught";
  const rare = caught && c.speciesPoor;
  return (
    <li
      data-state={c.state}
      {...(rare ? { "data-rarity": "" } : {})}
      className={cn(
        "animate-list-in grid min-w-0 content-start gap-1 break-words rounded-card bg-card p-3 text-card-foreground shadow-elevation-1",
        rare && "border-2 border-warning-border",
      )}
    >
      <Picture card={c} />
      <span className="text-sm text-muted-foreground">{`#${String(c.number).padStart(3, "0")}`}</span>
      <span className="font-semibold">{c.species}</span>
      {c.germanName !== null && (
        <span title={c.germanNameFull ?? c.germanName}>{c.germanName}</span>
      )}
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
        {c.speciesPoor && <Badge variant="warning">Artenarm</Badge>}
      </span>
      {c.specimenCount > 1 && (
        <span className="text-muted-foreground">{`${c.specimenCount} Pflanzen`}</span>
      )}
      <WikipediaSource
        label="Quelle"
        sourceUrl={c.sourceUrl}
        shown={c.summary !== null || c.imageUrl !== null}
      />
    </li>
  );
}
