import { useEffect, useState } from "react";
import type { SpeciesHit } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { SearchInput } from "@/shared/ui/search-input";
import { Label } from "@/shared/ui/label";
import { texts } from "@/shared/lib/text-rules/texts";
import { CATALOG_ADDRESS } from "@/shared/patterns/navigation/navigation/navigation";
import { searchSpecies } from "../../../catalog";
import table from "../../wishlist.de.json";

const ui = texts(table);

type Token = () => Promise<string | undefined>;

/** The catalog's proposal layer: `?sheet=propose` of the catalog (US-QS-21). */
const PROPOSE_ADDRESS = `${CATALOG_ADDRESS}&sheet=propose`;

/**
 * What the search of the typed text found (issue 1964): nothing typed, a search for the text that runs, hits, no hit or a
 * failed request. A result counts only for the text it was asked for, so an old answer never speaks for a new text.
 */
type Outcome =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "hits"; hits: readonly SpeciesHit[] }
  | { kind: "none" }
  | { kind: "failed" };

type Result = { term: string; attempt: number; hits: readonly SpeciesHit[] | null };

/** The hits of one search; `null` when the request failed or no token is there: a failure is never "no hit" (issue 1964). */
async function searchOnce(
  api: string,
  token: Token,
  term: string,
): Promise<readonly SpeciesHit[] | null> {
  try {
    const t = await token();
    const r = t ? await searchSpecies(api, t, term) : null;
    return r?.ok ? r.value : null;
  } catch {
    // Shown as "Suche nicht möglich." with a retry, never as a search without hits.
    return null;
  }
}

/** Hits for the typed text after a short pause; an empty text asks nothing. `retry` asks the same text again. */
function useSearch(api: string, token: Token, text: string) {
  const term = text.trim();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ term: "", attempt: -1, hits: null });
  useEffect(() => {
    if (!term) return;
    let current = true;
    const timer = setTimeout(() => {
      void searchOnce(api, token, term).then((hits) => {
        if (current) setResult({ term, attempt, hits });
      });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [api, token, term, attempt]);
  const outcome: Outcome = !term
    ? { kind: "idle" }
    : result.term !== term || result.attempt !== attempt
      ? { kind: "searching" }
      : result.hits === null
        ? { kind: "failed" }
        : result.hits.length === 0
          ? { kind: "none" }
          : { kind: "hits", hits: result.hits };
  // While a new text is searched, the hits of the last answer stay in place (no flicker); no-hit and failure are never
  // shown for the new text before its answer.
  const lastHits = outcome.kind === "searching" && result.hits ? result.hits : [];
  return { outcome, lastHits, retry: () => setAttempt((n) => n + 1) };
}

/** The one message of the status line: the no-hit text, the failure, the choice or the instruction (issue 1964). */
function statusText(outcome: Outcome, query: string, chosen: string | null): string {
  if (outcome.kind === "none") return ui("pick.noHit", { query });
  if (outcome.kind === "failed") return ui("pick.failed");
  if (chosen) return ui("pick.chosen", { name: chosen });
  return ui("pick.hint");
}

/** What a search without a hit offers: the typed text as the own name, and the catalog's proposal (SG-SEARCH-02). */
function NoHitActions(props: { query: string; onOwnName: (text: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="secondary" onClick={() => props.onOwnName(props.query)}>
        {ui("pick.own")}
      </Button>
      <Button asChild variant="link">
        <a href={PROPOSE_ADDRESS}>{ui("pick.propose")}</a>
      </Button>
    </div>
  );
}

function HitList(props: { hits: readonly SpeciesHit[]; onPick: (hit: SpeciesHit) => void }) {
  if (props.hits.length === 0) return null;
  return (
    <ul className="m-0 grid list-none gap-2 p-0" aria-label={ui("pick.hits")}>
      {props.hits.slice(0, 8).map((h) => (
        <li key={h.id}>
          <Button
            type="button"
            variant="secondary"
            className="h-auto min-h-12 w-full justify-start whitespace-normal text-left"
            onClick={() => props.onPick(h)}
          >
            <i>{h.latinName}</i>
            {h.germanName ? ` (${h.germanName})` : ""}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The main way to a wish (US-WUN-01): pick the species from the catalog, as with the first plant. The pick fills the
 * names of the wish; the free fields below "Mehr Angaben" stay as the fallback for a species the catalog lacks.
 * A search without a hit offers the typed text as the wish's own name and the catalog's proposal (issue 1964, SG-SEARCH-02).
 */
export function SpeciesPick(props: {
  api: string;
  token: Token;
  chosen: string | null;
  onPick: (hit: SpeciesHit) => void;
  /** Takes the searched text as the name of the wish; the form focuses the name field (issue 1964). */
  onOwnName: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const { outcome, lastHits, retry } = useSearch(props.api, props.token, text);
  const query = text.trim();
  const hits = outcome.kind === "hits" ? outcome.hits : lastHits;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="wish-species-search">{ui("pick.label")}</Label>
      <SearchInput
        id="wish-species-search"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onClear={() => setText("")}
      />
      {/* The status line is the one message for the screen reader too (issue 1964). */}
      <p role="status" className="m-0 text-sm text-muted-foreground">
        {statusText(outcome, query, props.chosen)}
      </p>
      {outcome.kind === "none" && <NoHitActions query={query} onOwnName={props.onOwnName} />}
      {outcome.kind === "failed" && (
        <div className="flex flex-col items-start gap-2">
          <Button type="button" variant="secondary" onClick={retry}>
            {ui("pick.retry")}
          </Button>
        </div>
      )}
      <HitList
        hits={hits}
        onPick={(h) => {
          props.onPick(h);
          setText("");
        }}
      />
    </div>
  );
}
