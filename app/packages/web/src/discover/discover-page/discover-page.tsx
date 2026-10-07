import type { SuggestionDeck } from "@pflanzendex/core";
import { useCallback, useState } from "react";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { LoadFrame } from "../../kernel";
import { DeckView } from "../deck-view/deck-view";
import { loadSuggestions } from "./discover-api";

/** Placeholder with the layout of a card on a phone: image, name, text, three buttons (DS-52). */
function DeckSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}

/**
 * Discover (US-ENT-01): species of the catalog that the keeper neither owns nor has a wish for, one at a time as a card.
 * Derived on every request, nothing stored (P-01). "Neuer Stapel" asks for the next deck.
 */
export function DiscoverPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  /** The destination Entdecken shows the page below its title: no heading of its own (US-QS-14). */
  embedded?: boolean;
}) {
  const { api, token, embedded } = props;
  const [deck, setDeck] = useState(1);
  const load = useCallback((t: string) => loadSuggestions(api, t, deck), [api, deck]);
  return (
    <section
      {...(embedded ? { "aria-label": "Vorschläge" } : { "aria-labelledby": "discover-title" })}
      className="min-w-0"
    >
      <LoadFrame
        queryKey={["discover", deck]}
        token={token}
        load={load}
        loadingText="Vorschläge werden geladen …"
        {...(embedded ? {} : { heading: "Entdecken" })}
        loadingFallback={<DeckSkeleton label="Vorschläge werden geladen …" />}
        fresh
      >
        {(value: SuggestionDeck) => (
          <>
            {embedded ? null : (
              <h1 id="discover-title" className="mb-2 text-2xl font-semibold">
                Entdecken
              </h1>
            )}
            <DeckView key={deck} deck={value} onNewDeck={() => setDeck((d) => d + 1)} />
          </>
        )}
      </LoadFrame>
    </section>
  );
}
