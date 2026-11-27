import { useCallback } from "react";
import { EXCHANGE_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { entityKey, type Response, useRepeatKey } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import {
  answerYes,
  loadMatchDeck,
  saveAnswer,
  undoAnswer,
  type DeckData,
} from "../../api/match-api";
import { MatchDeck } from "./match-deck/match-deck";
import { DeckSkeleton } from "./match.skeleton";

type Token = () => Promise<string | undefined>;
const KEY = ["swap", "match"] as const;
const SIGN_IN_NEEDED = {
  ok: false as const,
  error: { code: "access.not_signed_in", text: "Bitte melde dich an." },
};

/** The writes of the deck, each with a fresh token; without a token they answer "sign in" (P-10). */
function useWrites(api: string, token: Token) {
  // One held key per offer and action (US-QS-03): a lost answer on one card never repeats another card's write.
  const keys = useRepeatKey();
  const yes = useCallback(
    async (offerId: string, counter: string | null): ReturnType<typeof answerYes> => {
      const t = await token();
      return t
        ? keys.run(
            (key) => answerYes(api, t, { offerId, counterSpecimenId: counter }, { key }),
            entityKey("offer", offerId, `yes:${counter}`),
          )
        : (SIGN_IN_NEEDED as Response<never>);
    },
    [api, token],
  );
  const answer = useCallback(
    async (offerId: string, a: "no" | "later") => {
      const t = await token();
      return t
        ? keys.run(
            (key) => saveAnswer(api, t, { offerId, answer: a }, { key }),
            entityKey("offer", offerId, `answer:${a}`),
          )
        : (SIGN_IN_NEEDED as Response<never>);
    },
    [api, token],
  );
  const undo = useCallback(
    async (offerId: string) => {
      const t = await token();
      return t
        ? keys.run(
            (key) => undoAnswer(api, t, offerId, { key }),
            entityKey("offer", offerId, "undo"),
          )
        : (SIGN_IN_NEEDED as Response<never>);
    },
    [api, token],
  );
  return { yes, answer, undo };
}

/**
 * The match deck (US-TAU-01, epic TAU): open offers of friends that match the own wishlist, one card at a time with "Anfragen",
 * "Ablehnen" and "Später" or a swipe; Ablehnen and Später are stored privately (US-TAU-02). A second view on the data of the exchange (US-SOZ-09), no new way to reach strangers.
 * Private by default (P-05); no ranking, no score (FR-TAU-06).
 */
export function MatchPage(props: { api: string; token: Token; calm?: boolean }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadMatchDeck(api, t), [api]);
  const { yes, answer, undo } = useWrites(api, token);
  return (
    // One screen (US-QS-15, DS-61): the deck fills the frame, so the card takes the free height and the page does not scroll;
    // at a large text size the frame scrolls inside itself (issue 2421).
    <div data-fit-screen="" data-fit-fill="" className="flex min-h-0 min-w-0 flex-col">
      <FullView
        headingId="match-page-title"
        title="Passende Angebote"
        back={{ label: "Zurück zur Tauschbörse", to: EXCHANGE_PATH }}
      >
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText="Angebote werden geladen …"
          loadingFallback={<DeckSkeleton label="Angebote werden geladen …" />}
          fresh
        >
          {(deck: DeckData) => (
            <MatchDeck
              cards={deck.cards}
              entries={deck.entries}
              empty={deck.empty ?? null}
              requested={deck.requested ?? 0}
              calm={props.calm ?? false}
              onYes={yes}
              onAnswer={answer}
              onUndo={undo}
            />
          )}
        </LoadFrame>
      </FullView>
    </div>
  );
}
