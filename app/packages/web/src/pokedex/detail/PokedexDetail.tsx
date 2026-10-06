import type { CaughtSpecies } from "@pflanzendex/core";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Chips, catchText, countText } from "../PokedexCards";

/** A source is a link only if it is a plain http(s) address; anything else is shown as text, never as a link. */
function webAddress(source: string): URL | null {
  try {
    const url = new URL(source);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
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
 * The detail view of one caught species (US-POK-09): replaces the list, so at most one is open; "Schließen" and
 * Escape close it. Image and short text come with the taxonomy build (US-POK-03): until then they are shown as
 * unknown, nothing is invented (P-08).
 */
export function SpeciesDetail(props: {
  species: CaughtSpecies;
  onClose: () => void;
  onOpenSpecies?: (id: string) => void;
}) {
  const { species: c, onClose, onOpenSpecies } = props;
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <section
      className="mb-6 grid max-w-2xl min-w-0 gap-2 break-words [&_p]:m-0"
      aria-label={`Details zu ${c.species}`}
    >
      <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border bg-card text-muted-foreground">
        Noch kein Bild vorhanden.
      </div>
      <h2 ref={title} tabIndex={-1} className="m-0 text-xl font-semibold">
        {c.germanName ?? c.species}
      </h2>
      {c.germanName !== null && <p className="font-semibold">{c.species}</p>}
      <p>Kurztext: unbekannt</p>
      <p>{`Gattung: ${c.genus}`}</p>
      <p>{`Familie: ${family(c)}`}</p>
      <p>Status: gefangen</p>
      <p>{countText(c.specimenCount)}</p>
      <p className="text-sm">{catchText(c.caughtDate)}</p>
      <Chips chips={c.chips} />
      <Source source={c.source} />
      <div className="flex flex-wrap gap-2">
        {onOpenSpecies && (
          <Button type="button" onClick={() => onOpenSpecies(c.speciesId)}>
            Zum Artprofil
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </section>
  );
}
