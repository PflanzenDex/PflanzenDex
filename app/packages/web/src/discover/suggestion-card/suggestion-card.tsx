import type { Suggestion, SuggestionAttributes } from "@pflanzendex/core";
import { useRef, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { swipeDirection } from "../swipe/swipe";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);
const LEVEL = { low: "niedrig", medium: "mittel", high: "hoch" } as const;
const SIZE = { small: "klein", medium: "mittel", large: "groß" } as const;
const UNKNOWN = "unbekannt";

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
      className="h-56 w-full rounded-lg object-cover"
    />
  );
}

/**
 * The Wikipedia text keeps the language it was stored in. Where that is known, `lang` tells a screen reader to switch the
 * voice (WCAG 3.1.2) and a visible hint names a foreign language; where it is unknown no language is claimed (P-08).
 */
function Summary({ s }: { s: Suggestion }) {
  if (s.summary === null) return <p className="m-0 text-sm">Keine Beschreibung vorhanden.</p>;
  const foreign = s.summaryLanguage === "en";
  return (
    <div className="grid gap-1">
      {foreign && <p className="m-0 text-xs text-muted-foreground">Text auf Englisch</p>}
      <p
        {...(s.summaryLanguage === null ? {} : { lang: s.summaryLanguage })}
        className="m-0 text-sm"
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
      <dd
        className="m-0"
        {...(s.difficulty === null ? {} : { "aria-label": `${s.difficulty} von 3` })}
      >
        {s.difficulty === null ? UNKNOWN : stars(s.difficulty)}
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
        "mx-auto grid w-full min-w-0 max-w-md touch-pan-y content-start gap-3 break-words",
        "rounded-xl border border-border bg-card p-4 text-card-foreground",
      )}
    >
      <Picture s={s} />
      <div>
        <h2 id="suggestion-title" tabIndex={-1} className="m-0 scroll-mb-24 text-xl font-semibold">
          {s.species}
        </h2>
        <p className="m-0">{s.germanName ?? "Deutscher Name unbekannt"}</p>
      </div>
      <Summary s={s} />
      <Facts s={s} />
      {s.sourceUrl !== null && (
        <a
          href={s.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          Bild und Text: Wikipedia (CC BY-SA)
        </a>
      )}
      <section aria-label="Gründe">
        <h3 className="m-0 mb-1 text-sm font-semibold">Warum diese Art?</h3>
        <ul className="m-0 grid list-disc gap-1 pl-5 text-sm">
          {s.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
