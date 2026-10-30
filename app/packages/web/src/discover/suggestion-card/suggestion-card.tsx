import type { AttributeSource, Suggestion, SuggestionAttributes } from "@pflanzendex/core";
import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button/button";
import { Badge } from "@/components/ui/display/badge/badge";
import { dateText } from "@/lib/format";
import { cn } from "@/lib/utils";
import { swipeDirection } from "../swipe/swipe";
import { DifficultyStars, WikipediaSource } from "@/components/collector-card/collector-card";

const LEVEL = { low: "niedrig", medium: "mittel", high: "hoch" } as const;
const SIZE = { small: "klein", medium: "mittel", large: "groß" } as const;
const UNKNOWN = "unbekannt";
const SOURCE = { gbif: "GBIF", wikipedia: "Wikipedia", wikidata: "Wikidata" } as const;
const FIELD_NAME: Record<AttributeSource["field"], string> = {
  humidity: "Luftfeuchte",
  minTemperature: "Mindesttemperatur",
  toxicToPets: "Haustiere",
  growthSize: "Wuchsgröße",
};

/** Attributes of DM-ENT-01; a value the catalog does not know reads "unbekannt" (P-08, FR-ENT-04). */
function attributeRows(a: SuggestionAttributes): [string, string][] {
  const pets = a.toxicToPets === null ? UNKNOWN : a.toxicToPets ? "giftig" : "ungiftig";
  return [
    ["Luftfeuchte", a.humidity === null ? UNKNOWN : LEVEL[a.humidity]],
    ["Mindesttemperatur", a.minTemperature === null ? UNKNOWN : `${a.minTemperature} °C`],
    ["Haustiere", pets],
    ["Wuchsgröße", a.growthSize === null ? UNKNOWN : SIZE[a.growthSize]],
  ];
}

/**
 * Where each known attribute comes from (US-ENT-09, P-08): source as a link, license, retrieval date and the review
 * status. Nothing is listed for an unknown attribute, so no value shows up without its evidence.
 */
function AttributeSources({ sources }: { sources: readonly AttributeSource[] }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label="Quellen der Merkmale" className="m-0 grid list-none gap-1 p-0 text-xs">
      {sources.map((a) => (
        <li key={a.field} className="text-muted-foreground">
          {FIELD_NAME[a.field]}:{" "}
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">
            {SOURCE[a.source]}
          </a>{" "}
          ({a.license}, abgerufen am {dateText(a.retrievedAt)}), ungeprüft
        </li>
      ))}
    </ul>
  );
}

/** The image is a link to its source, not a copy (P-05); without one a neutral sprout stands in. */
function Picture({ s }: { s: Suggestion }) {
  if (s.imageUrl === null)
    return (
      <span aria-hidden="true" className="text-center text-6xl">
        🌱
      </span>
    );
  return (
    <img
      src={s.imageUrl}
      alt={`Bild von ${s.species}`}
      className="h-56 min-h-12 w-full shrink rounded-lg object-cover"
    />
  );
}

/**
 * The Wikipedia text keeps the language it was stored in. Where that is known, `lang` tells a screen reader to switch the
 * voice (WCAG 3.1.2) and a visible hint names a foreign language; where it is unknown no language is claimed (P-08).
 */
function Summary({ s, more }: { s: Suggestion; more: boolean }) {
  if (s.summary === null) return <p className="m-0 text-sm">Keine Beschreibung vorhanden.</p>;
  const foreign = s.summaryLanguage === "en";
  return (
    <div className="grid gap-1">
      {foreign && <p className="m-0 text-xs text-muted-foreground">Text auf Englisch</p>}
      <p
        {...(s.summaryLanguage === null ? {} : { lang: s.summaryLanguage })}
        className={cn("m-0 text-sm", !more && "line-clamp-3")}
      >
        {s.summary}
      </p>
    </div>
  );
}

function Facts({ s }: { s: Suggestion }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Lichtzone</dt>
      <dd className="m-0">{s.lightZone === null ? UNKNOWN : `Zone ${s.lightZone}`}</dd>
      <dt className="text-muted-foreground">Schwierigkeit</dt>
      <dd className="m-0">
        {s.difficulty === null ? (
          UNKNOWN
        ) : (
          <DifficultyStars level={s.difficulty} label={`${s.difficulty} von 3`} />
        )}
      </dd>
      {attributeRows(s.attributes).flatMap(([name, value]) => [
        <dt key={`${name}-t`} className="text-muted-foreground">
          {name}
        </dt>,
        <dd key={`${name}-d`} className="m-0">
          {value}
        </dd>,
      ])}
    </dl>
  );
}

/** Facts, sources and reasons after "Mehr"; collapsed, the card fits one screen (US-QS-21). */
function Details({ s, more }: { s: Suggestion; more: boolean }) {
  return (
    <div className={cn("grid gap-3", !more && "hidden")}>
      <Facts s={s} />
      <AttributeSources sources={s.attributeSources ?? []} />
      <section aria-label="Gründe">
        <h3 className="m-0 mb-1 text-sm font-semibold">Warum diese Art?</h3>
        <ul className="m-0 grid list-disc gap-1 pl-5 text-sm">
          {s.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * One suggestion as a large card (US-ENT-01): image with source and license (FR-POK-07), names, text, zone, difficulty
 * and the attributes of DM-ENT-01, the reasons below. A swipe left or right decides like the buttons; the buttons stay
 * the way without a gesture (NFR-13). No percentage and no "match" (FR-ENT-06).
 */
export function SuggestionCard(props: {
  suggestion: Suggestion;
  onSwipe: (direction: "left" | "right") => void;
}) {
  const s = props.suggestion;
  const [more, setMore] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const down = (e: PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    const from = start.current;
    start.current = null;
    const direction = from && swipeDirection(e.clientX - from.x, e.clientY - from.y);
    if (direction) props.onSwipe(direction);
  };
  return (
    <article
      aria-labelledby="suggestion-title"
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={() => (start.current = null)}
      className={cn(
        "mx-auto flex min-h-48 w-full min-w-0 max-w-md flex-1 basis-0 touch-pan-y flex-col gap-2 overflow-y-auto break-words",
        "rounded-xl border border-border bg-card p-3 text-card-foreground",
      )}
    >
      <Picture s={s} />
      <div>
        {s.exploration && (
          <Badge variant="secondary" className="mb-1">
            Mal etwas anderes
          </Badge>
        )}
        <h2 id="suggestion-title" tabIndex={-1} className="m-0 scroll-mb-24 text-xl font-semibold">
          {s.species}
        </h2>
        <p className="m-0">{s.germanName ?? "Deutscher Name unbekannt"}</p>
      </div>
      <Summary s={s} more={more} />
      <Button
        type="button"
        variant="link"
        aria-expanded={more}
        className="w-fit"
        onClick={() => setMore((m) => !m)}
      >
        {more ? "Weniger" : "Mehr"}
      </Button>
      <Details s={s} more={more} />
      <WikipediaSource
        label="Bild und Text"
        sourceUrl={s.sourceUrl}
        shown={s.summary !== null || s.imageUrl !== null}
        className="inline-flex min-h-11 items-center"
      />
    </article>
  );
}
