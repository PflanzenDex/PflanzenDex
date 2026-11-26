import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Species, SpeciesHit } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { SearchInput } from "@/shared/ui/search-input";
import { Label } from "@/shared/ui/label";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./species-step.de.json";

const ui = texts(table);

type Token = () => Promise<string | undefined>;
type Found<T> = { ok: true; value: T } | { ok: false; error: { code: string } };

/** The catalog calls, handed in by the app: the shell does not import the catalog module (ADR 0003). */
export interface SpeciesLookup {
  readonly search: (
    api: string,
    token: string,
    text: string,
  ) => Promise<Found<readonly SpeciesHit[]>>;
  readonly load: (api: string, token: string, id: string) => Promise<Found<Species>>;
}

/**
 * Hits for the typed text after a short pause; an empty text asks nothing. `answered` says that the answer belongs to the
 * text typed now: until then no "no hit" line is shown for it (issue 1964).
 */
function useHits(lookup: SpeciesLookup, api: string, token: Token, text: string) {
  const [state, setState] = useState<{
    term: string;
    hits: readonly SpeciesHit[];
    failed: boolean;
  }>({ term: "", hits: [], failed: false });
  useEffect(() => {
    const term = text.trim();
    if (!term) return;
    let current = true;
    const timer = setTimeout(() => {
      void (async () => {
        const t = await token();
        if (!t) return;
        const r = await lookup.search(api, t, term);
        if (current) setState({ term, hits: r.ok ? r.value : [], failed: !r.ok });
      })();
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [lookup, api, token, text]);
  const term = text.trim();
  return {
    hits: term ? state.hits : [],
    failed: term ? state.failed : false,
    answered: term !== "" && state.term === term,
  };
}

function HitList(props: {
  hits: readonly SpeciesHit[];
  chosen: string | undefined;
  onPick: (id: string) => void;
}) {
  if (props.hits.length === 0) return null;
  return (
    <ul className="m-0 grid list-none gap-2 p-0" aria-label={ui("hitsLabel")}>
      {props.hits.slice(0, 8).map((h) => (
        <li key={h.id}>
          <Button
            type="button"
            variant={props.chosen === h.id ? "default" : "secondary"}
            className="h-auto min-h-12 w-full justify-start whitespace-normal text-left"
            aria-pressed={props.chosen === h.id}
            onClick={() => props.onPick(h.id)}
          >
            {/* The chosen hit says so in words and a mark, not by its colour alone (issue 1045). */}
            {props.chosen === h.id ? (
              <Check aria-hidden="true" className="size-4 shrink-0" />
            ) : null}
            <i>{h.latinName}</i>
            {h.germanName ? ` (${h.germanName})` : ""}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** The step's heading: "Schritt n von m" is said once, by the focused heading (US-ACC-03, issue 1612). */
function StepHeading(props: { title?: string | undefined; stepLabel?: string | undefined }) {
  return (
    <h2 tabIndex={-1} className="text-base font-semibold">
      {props.stepLabel && <span className="sr-only">{`${props.stepLabel}:`}</span>}
      {props.stepLabel && " "}
      {props.title ?? ui("title")}
    </h2>
  );
}

/**
 * The search's status: a search without a hit names the query in one visible line, with "Art vorschlagen" below it; any
 * other state says only the hit count to a screen reader (issue 1964).
 */
function SearchStatus(props: {
  noHit: boolean;
  query: string;
  hits: number;
  onCatalog: () => void;
}) {
  if (!props.noHit)
    return (
      <p role="status" className="sr-only">
        {props.hits > 0 ? ui("hits", { count: Math.min(props.hits, 8) }) : ""}
      </p>
    );
  return (
    <>
      <p role="status" className="m-0 text-sm">
        {ui("noHit", { query: props.query })}
      </p>
      <div className="flex flex-col items-start gap-2">
        <Button type="button" variant="secondary" onClick={props.onCatalog}>
          {ui("propose")}
        </Button>
      </div>
    </>
  );
}

/** Step 1 of the first plant (US-ONB-01): search the species by name; picking one loads its profile. */
export function SpeciesStep(props: {
  lookup: SpeciesLookup;
  api: string;
  token: Token;
  text: string;
  onText: (text: string) => void;
  species: Species | null;
  onPick: (species: Species) => void;
  onCatalog: () => void;
  title?: string;
  /** "Schritt n von m": said once, by the focused heading (US-ACC-03, issue 1612). */
  stepLabel?: string;
}) {
  const { api, token, text, species } = props;
  const { hits, failed, answered } = useHits(props.lookup, api, token, text);
  const [refused, setRefused] = useState<string | null>(null);
  // Only the answer for the text typed now counts: no no-hit line and no failure for an older text (issue 1964).
  const noHit = answered && hits.length === 0 && !failed;
  const alert = refused ?? (answered && failed ? ui("failed") : null);
  const pick = async (id: string) => {
    const t = await token();
    if (!t) return;
    const r = await props.lookup.load(api, t, id);
    if (!r.ok) {
      setRefused(errorText(r.error.code));
      return;
    }
    setRefused(null);
    props.onPick(r.value);
  };
  return (
    <section className="flex flex-col gap-3">
      <StepHeading title={props.title} stepLabel={props.stepLabel} />
      <Label htmlFor="first-plant-search">{ui("label")}</Label>
      <SearchInput
        id="first-plant-search"
        placeholder={ui("placeholder")}
        autoComplete="off"
        value={text}
        onChange={(e) => props.onText(e.target.value)}
        onClear={() => props.onText("")}
      />
      <p className="m-0 text-sm text-muted-foreground">{ui("help")}</p>
      {alert && <p role="alert">{alert}</p>}
      <SearchStatus
        noHit={noHit}
        query={text.trim()}
        hits={hits.length}
        onCatalog={props.onCatalog}
      />
      <HitList hits={hits} chosen={species?.id} onPick={(id) => void pick(id)} />
    </section>
  );
}
