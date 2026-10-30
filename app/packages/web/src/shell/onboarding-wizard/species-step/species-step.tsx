import { useEffect, useState } from "react";
import type { Species, SpeciesHit } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Label } from "@/components/ui/display/label/label";
import { errorText } from "@/lib/error-text";

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

/** Hits for the typed text after a short pause; an empty text asks nothing. */
function useHits(lookup: SpeciesLookup, api: string, token: Token, text: string) {
  const [state, setState] = useState<{ hits: readonly SpeciesHit[]; failed: boolean }>({
    hits: [],
    failed: false,
  });
  useEffect(() => {
    const term = text.trim();
    if (!term) return;
    let current = true;
    const timer = setTimeout(() => {
      void (async () => {
        const t = await token();
        if (!t) return;
        const r = await lookup.search(api, t, term);
        if (current) setState({ hits: r.ok ? r.value : [], failed: !r.ok });
      })();
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [lookup, api, token, text]);
  return text.trim() ? state : { hits: [], failed: false };
}

function HitList(props: {
  hits: readonly SpeciesHit[];
  chosen: string | undefined;
  onPick: (id: string) => void;
}) {
  if (props.hits.length === 0) return null;
  return (
    <ul className="m-0 grid list-none gap-2 p-0" aria-label="Treffer">
      {props.hits.slice(0, 8).map((h) => (
        <li key={h.id}>
          <Button
            type="button"
            variant={props.chosen === h.id ? "default" : "secondary"}
            className="h-auto min-h-12 w-full justify-start whitespace-normal text-left"
            aria-pressed={props.chosen === h.id}
            onClick={() => props.onPick(h.id)}
          >
            <i>{h.latinName}</i>
            {h.germanName ? ` (${h.germanName})` : ""}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** What a screen reader hears about the hits. */
const announcement = (text: string, failed: boolean, count: number) =>
  !text.trim() || failed
    ? ""
    : count === 0
      ? "Nichts gefunden."
      : `${Math.min(count, 8)} Treffer, wähle eine Art.`;

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
}) {
  const { api, token, text, species } = props;
  const { hits, failed } = useHits(props.lookup, api, token, text);
  const [refused, setRefused] = useState<string | null>(null);
  const pick = async (id: string) => {
    const t = await token();
    if (!t) return;
    const r = await props.lookup.load(api, t, id);
    if (r.ok) {
      setRefused(null);
      props.onPick(r.value);
    } else setRefused(errorText(r.error.code));
  };
  return (
    <section className="flex flex-col gap-3">
      <h2 tabIndex={-1} className="text-xl font-semibold">
        {props.title ?? "Deine erste Pflanze"}
      </h2>
      <Label htmlFor="first-plant-search">Name der Pflanze</Label>
      <Input
        id="first-plant-search"
        type="search"
        autoComplete="off"
        value={text}
        onChange={(e) => props.onText(e.target.value)}
      />
      <p className="m-0 text-sm text-muted-foreground">
        Tippe den Namen deiner Pflanze, wir suchen die Art.
      </p>
      {(failed || refused) && (
        <p role="alert">{refused ?? "Die Suche hat nicht geklappt. Versuche es noch einmal."}</p>
      )}
      <p role="status" className="sr-only">
        {announcement(text, failed, hits.length)}
      </p>
      <HitList hits={hits} chosen={species?.id} onPick={(id) => void pick(id)} />
      {text.trim() && hits.length === 0 && !failed && (
        <p className="m-0 text-sm">
          Nichts gefunden. Ist der Katalog noch leer oder fehlt die Art?{" "}
          <Button type="button" variant="link" onClick={props.onCatalog}>
            Im Katalog suchen oder vorschlagen
          </Button>
        </p>
      )}
    </section>
  );
}
