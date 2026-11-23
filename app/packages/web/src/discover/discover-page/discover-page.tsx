import { entityKey, useRepeatKey } from "@/shared/data";
import type { SuggestionDeck } from "@pflanzendex/core";
import { useCallback, useState } from "react";
import { type Response } from "../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { DeckView } from "../deck-view/deck-view";
import { DiscoverPageSkeleton } from "./discover-page.skeleton";
import { decideSuggestion, loadSuggestions, undoSuggestionDecision } from "./discover-api";
import table from "../discover.de.json";
import { texts } from "@/shared/lib/text-rules/texts";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";

const t = texts(table);

const SIGN_IN_NEEDED = {
  ok: false as const,
  error: { code: "access.not_signed_in", text: t("page.signIn") },
};

/**
 * Decide and undo of a suggestion (US-QS-03). The species is the target; the decision and the undo are its actions, so a
 * lost answer repeats under the key of its own action and a success on the species frees the other.
 */
function useSuggestionWrites(api: string, token: () => Promise<string | undefined>) {
  const keys = useRepeatKey();
  const decide = useCallback(
    (species: string, decision: "yes" | "no") =>
      keys.run(
        (key) => signedIn(token, (t) => decideSuggestion(api, t, { species, decision }, { key })),
        entityKey("species", species, `decide:${decision}`),
      ),
    [api, token, keys],
  );
  const undo = useCallback(
    (species: string) =>
      keys.run(
        (key) => signedIn(token, (t) => undoSuggestionDecision(api, t, species, { key })),
        entityKey("species", species, "undo"),
      ),
    [api, token, keys],
  );
  return { decide, undo };
}

/** Runs a write with the token of the keeper; without a sign-in the answer says so (P-10). */
async function signedIn<T>(
  token: () => Promise<string | undefined>,
  write: (t: string) => Promise<Response<T>>,
): Promise<Response<T>> {
  const t = await token();
  return t ? write(t) : SIGN_IN_NEEDED;
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
  // Not `fresh`: a return to the view shows the last deck at once and the new one replaces it (US-ENT-01, issue 1652).
  const load = useCallback(
    (t: string) => loadSuggestions(api, t, zone === undefined ? { deck } : { deck, zone }),
    [api, deck, zone],
  );
  const { decide, undo } = useSuggestionWrites(api, token);
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
      >
        {(value: SuggestionDeck) => (
          <>
            {embedded ? null : <PageHeader headingId="discover-title" title={t("page.title")} />}
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
