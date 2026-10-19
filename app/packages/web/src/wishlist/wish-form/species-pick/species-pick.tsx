import { useEffect, useState } from "react";
import type { SpeciesHit } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Label } from "@/components/ui/display/label/label";
import { searchSpecies } from "../../../catalog";

type Token = () => Promise<string | undefined>;

/** Hits for the typed text after a short pause; an empty text asks nothing. */
function useHits(api: string, token: Token, text: string) {
  const [hits, setHits] = useState<readonly SpeciesHit[]>([]);
  useEffect(() => {
    const term = text.trim();
    if (!term) return;
    let current = true;
    const timer = setTimeout(() => {
      void (async () => {
        const t = await token();
        const r = t ? await searchSpecies(api, t, term) : null;
        if (current) setHits(r?.ok ? r.value : []);
      })();
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [api, token, text]);
  return text.trim() ? hits : [];
}

/**
 * The main way to a wish (US-WUN-01): pick the species from the catalog, as with the first plant. The pick fills the
 * names of the wish; the free fields below "Mehr Angaben" stay as the fallback for a species the catalog lacks.
 */
export function SpeciesPick(props: {
  api: string;
  token: Token;
  chosen: string | null;
  onPick: (hit: SpeciesHit) => void;
}) {
  const [text, setText] = useState("");
  const hits = useHits(props.api, props.token, text);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="wish-species-search">Art suchen</Label>
      <Input
        id="wish-species-search"
        type="search"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p role="status" className="m-0 text-sm text-muted-foreground">
        {props.chosen ? `Gewählt: ${props.chosen}` : "Tippe einen Namen und wähle eine Art."}
      </p>
      {hits.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0" aria-label="Treffer">
          {hits.slice(0, 8).map((h) => (
            <li key={h.id}>
              <Button
                type="button"
                variant="secondary"
                className="h-auto min-h-12 w-full justify-start whitespace-normal text-left"
                onClick={() => {
                  props.onPick(h);
                  setText("");
                }}
              >
                <i>{h.latinName}</i>
                {h.germanName ? ` (${h.germanName})` : ""}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
