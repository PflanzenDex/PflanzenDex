import type { CaughtSpecies } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Chips, catchText, countText } from "../pokedex-cards/pokedex-cards";

/**
 * A source is a link only if it is a plain http(s) address; anything else is shown as text, never as a link. User name
 * and password in the address are dropped, so they never reach the page (P-05).
 */
function webAddress(source: string): URL | null {
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.username = "";
    url.password = "";
    return url;
  } catch {
    return null;
  }
}

function Source(props: { source: string | null }) {
  if (props.source === null) return <p>Quelle: unbekannt</p>;
  const url = webAddress(props.source);
  if (url === null) return <p>{`Quelle: ${props.source}`}</p>;
  return (
    <p>
      <a
        href={url.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {`Quelle öffnen (${url.hostname})`}
      </a>
    </p>
  );
}

const family = (c: CaughtSpecies) =>
  c.familyLatin === null
    ? "unbekannt"
    : c.familyGerman === null
      ? c.familyLatin
      : `${c.familyLatin} (${c.familyGerman})`;

/**
 * The details of one caught species (US-POK-09), the content of its layer (US-QS-22): "Schließen" and Escape belong to
 * the layer. Image and short text come with the taxonomy build (US-POK-03): until then they are shown as unknown,
 * nothing is invented (P-08).
 */
export function SpeciesDetail(props: {
  species: CaughtSpecies;
  onOpenSpecies?: (id: string) => void;
}) {
  const { species: c, onOpenSpecies } = props;
  return (
    <section
      className="grid min-w-0 gap-2 break-words [&_p]:m-0"
      aria-label={`Details zu ${c.species}`}
    >
      <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-border bg-card text-muted-foreground">
        Noch kein Bild vorhanden.
      </div>
      {c.germanName !== null && <p className="font-semibold">{c.species}</p>}
      <p>Kurztext: unbekannt</p>
      <p>{`Gattung: ${c.genus}`}</p>
      <p>{`Familie: ${family(c)}`}</p>
      <p>Status: gefangen</p>
      <p>{countText(c.specimenCount)}</p>
      <p className="text-sm">{catchText(c.caughtDate)}</p>
      <Chips chips={c.chips} />
      <Source source={c.source} />
      {onOpenSpecies && (
        <Button type="button" onClick={() => onOpenSpecies(c.speciesId)}>
          Zum Artprofil
        </Button>
      )}
    </section>
  );
}
