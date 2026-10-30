import { useCallback } from "react";
import { Link } from "react-router";
import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { EXCHANGE_PATH } from "@/components/shared/navigation/nav-model/navigation/navigation";
import { Button } from "@/components/ui/button/button";
import { LoadFrame, type Response } from "../../../kernel";
import {
  answerYes,
  loadMatchDeck,
  saveAnswer,
  undoAnswer,
  type DeckData,
} from "../../api/match-api";
import { MatchDeck } from "./match-deck/match-deck";

type Token = () => Promise<string | undefined>;
const KEY = ["swap", "match"] as const;
const SIGN_IN_NEEDED = {
  ok: false as const,
  error: { code: "access.not_signed_in", text: "Bitte melde dich an." },
};

function DeckSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}

/** The writes of the deck, each with a fresh token; without a token they answer "sign in" (P-10). */
function useWrites(api: string, token: Token) {
  const yes = useCallback(
    async (offerId: string, counter: string | null): ReturnType<typeof answerYes> => {
      const t = await token();
      return t ? answerYes(api, t, offerId, counter) : (SIGN_IN_NEEDED as Response<never>);
    },
    [api, token],
  );
  const answer = useCallback(
    async (offerId: string, a: "no" | "later") => {
      const t = await token();
      return t ? saveAnswer(api, t, offerId, a) : (SIGN_IN_NEEDED as Response<never>);
    },
    [api, token],
  );
  const undo = useCallback(
    async (offerId: string) => {
      const t = await token();
      return t ? undoAnswer(api, t, offerId) : (SIGN_IN_NEEDED as Response<never>);
    },
    [api, token],
  );
  return { yes, answer, undo };
}

/**
 * The match deck (US-TAU-01, epic TAU): open offers of friends that match the own wishlist, one card at a time with "Ja",
 * "Nein" and "Später" or a swipe; Nein and Später are stored privately (US-TAU-02). A second view on the data of the exchange (US-SOZ-09), no new way to reach strangers.
 * Private by default (P-05); no ranking, no score (FR-TAU-06).
 */
export function MatchPage(props: { api: string; token: Token; calm?: boolean }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadMatchDeck(api, t), [api]);
  const { yes, answer, undo } = useWrites(api, token);
  return (
    <section aria-labelledby="match-page-title" className="flex min-w-0 flex-col gap-3">
      <div>
        <Button asChild variant="outline" size="touch">
          <Link to={EXCHANGE_PATH}>Zur Tauschbörse</Link>
        </Button>
      </div>
      <h1 id="match-page-title" className="text-2xl font-semibold">
        Passende Angebote
      </h1>
      <p className="text-muted-foreground [@media(max-height:700px)]:hidden">
        Angebote deiner Freunde, deren Art auf deiner Wunschliste steht, eins nach dem anderen.
      </p>
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText="Angebote werden geladen …"
        loadingFallback={<DeckSkeleton label="Angebote werden geladen …" />}
        heading="Passende Angebote"
        fresh
      >
        {(deck: DeckData) => (
          <MatchDeck
            cards={deck.cards}
            entries={deck.entries}
            empty={deck.empty ?? null}
            calm={props.calm ?? false}
            onYes={yes}
            onAnswer={answer}
            onUndo={undo}
          />
        )}
      </LoadFrame>
    </section>
  );
}
