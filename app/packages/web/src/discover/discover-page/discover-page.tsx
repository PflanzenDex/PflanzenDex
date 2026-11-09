import type { SuggestionDeck } from "@pflanzendex/core";
import { useCallback, useState } from "react";
import { LoadFrame, type Response, useRepeatKey } from "../../shared/data";
import { DeckView } from "../deck-view/deck-view";
import { DiscoverPageSkeleton } from "./discover-page.skeleton";
import { decideSuggestion, loadSuggestions, undoSuggestionDecision } from "./discover-api";
import table from "../discover.de.json";
import { texts } from "@/shared/lib/text-rules/texts";

const t = texts(table);

const SIGN_IN_NEEDED = {
  ok: false as const,
  error: { code: "access.not_signed_in", text: t("page.signIn") },
};

/** Runs a write with the token of the keeper; without a sign-in the answer says so (P-10). */
async function signedIn<T>(
  token: () => Promise<string | undefined>,
  keys: ReturnType<typeof useRepeatKey>,
  write: (t: string, key: string) => Promise<Response<T>>,
): Promise<Response<T>> {
  const t = await token();
  return t ? keys.run((key) => write(t, key)) : SIGN_IN_NEEDED;
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
  /** Only species of this light zone 2 to 4 (US-ENT-07, "Discover for <zone>" from the buffer warning). */
  zone?: number;
}) {
  const { api, token, embedded, zone } = props;
  const [deck, setDeck] = useState(1);
  const keys = useRepeatKey();
  const load = useCallback(
    (t: string) => loadSuggestions(api, t, zone === undefined ? { deck } : { deck, zone }),
    [api, deck, zone],
  );
  const decide = useCallback(
    (species: string, decision: "yes" | "no") =>
      signedIn(token, keys, (t, key) => decideSuggestion(api, t, { species, decision }, { key })),
    [api, token, keys],
  );
  const undo = useCallback(
    (species: string) =>
      signedIn(token, keys, (t, key) => undoSuggestionDecision(api, t, species, { key })),
    [api, token, keys],
  );
  return (
    <section
      {...(embedded
        ? { "aria-label": t("page.suggestions") }
        : { "aria-labelledby": "discover-title" })}
      className="flex min-w-0 flex-1 flex-col"
    >
      <LoadFrame
        queryKey={["discover", deck, zone ?? null]}
        token={token}
        load={load}
        loadingText={t("page.loading")}
        {...(embedded ? {} : { heading: t("page.title") })}
        loadingFallback={<DiscoverPageSkeleton label={t("page.loading")} />}
        fresh
      >
        {(value: SuggestionDeck) => (
          <>
            {embedded ? null : (
              <h1 id="discover-title" className="mb-2 text-2xl font-semibold">
                {t("page.title")}
              </h1>
            )}
            <DeckView
              key={deck}
              takeFocus={deck > 1}
              deck={value}
              onDecide={decide}
              onUndo={undo}
              onNewDeck={() => setDeck((d) => d + 1)}
            />
          </>
        )}
      </LoadFrame>
    </section>
  );
}
