import type { CollectorCard as Card } from "@pflanzendex/core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { catchText } from "./catch-text";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

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
      className={cn("h-32 w-full rounded-tile object-cover", c.state === "missing" && "grayscale")}
    />
  );
}

/** Genus count, difficulty and light zone; every unknown value says "unbekannt" (P-08). */
function Facts(props: { card: Card }) {
  const c = props.card;
  return (
    <>
      <span className="text-sm text-muted-foreground">
        {c.genusSpeciesCount === null
          ? "Gattung: Artenzahl unbekannt"
          : `Gattung: ${c.genusSpeciesCount} Arten`}
      </span>
      {c.difficulty === null ? (
        <span className="text-sm">Schwierigkeit unbekannt</span>
      ) : (
        <span className="text-sm" aria-label={`Schwierigkeit ${c.difficulty} von 3`}>
          {stars(c.difficulty)}
        </span>
      )}
      <span className="text-sm">
        {c.lightZone === null ? "Lichtzone unbekannt" : `Lichtzone ${c.lightZone}`}
      </span>
    </>
  );
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
      <span className="text-sm">{c.summary ?? "Keine Beschreibung vorhanden."}</span>
      <Facts card={c} />
      <span className="flex flex-wrap gap-1.5">
        <Badge variant={caught ? "default" : "outline"}>
          {c.caughtDate === null ? "noch nicht gefangen" : catchText(c.caughtDate)}
        </Badge>
        {c.speciesPoor && <Badge variant="warning">Artenarm</Badge>}
      </span>
      {c.specimenCount > 1 && (
        <span className="text-muted-foreground">{`${c.specimenCount} Exemplare`}</span>
      )}
      {c.sourceUrl !== null && (
        <a
          href={c.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline"
        >
          Quelle: Wikipedia (CC BY-SA)
        </a>
      )}
    </li>
  );
}
