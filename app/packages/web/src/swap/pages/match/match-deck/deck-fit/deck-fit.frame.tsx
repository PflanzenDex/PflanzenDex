import type { ReactNode } from "react";
import type { MatchCard } from "@pflanzendex/core";
import { MatchDeck } from "../match-deck";

// The match deck in the frame of the page, for the stories that judge its boxes in the browser (US-QS-15, US-TAU-01): the info
// button (`deck-help`) and the card with the row of decision buttons (`deck-fit`) stand in the same frame, as in the app.

/** The friend who gives the offer of `CARD`. */
export const OWNER = "Ben";

/** An offer of a friend: a short card, as the deck shows it. */
export const CARD: MatchCard = {
  ownerId: "u1",
  ownerName: OWNER,
  offerId: "o1",
  specimenId: "s1",
  type: "cutting",
  mode: "swap",
  wish: "Ein Ableger",
  note: "Gut bewurzelt",
  offeredAt: "2026-10-08T10:00:00.000Z",
  photosShared: false,
  specimenName: "Ableger",
  speciesLatin: "Aloe vera",
  speciesGerman: "Echte Aloe",
  health: { treatmentOpen: false, lastTreated: null },
  phase: "dormancy",
  lack: true,
  onWishlist: true,
  requested: false,
  reasons: [{ kind: "wishlist", species: "Aloe vera", reasoning: null }],
  imageUrl: null,
  imageSourceUrl: null,
};
const SECOND: MatchCard = { ...CARD, offerId: "o2", specimenId: "s2" };

const never = <T,>() => new Promise<T>(() => undefined);

/**
 * The page frame of the phone, as `AppShell` and `MatchPage` build it (US-QS-15, DS-61): the shell, `main` with its padding, the
 * one-screen frame (`data-fit-screen`, `data-fit-fill`), the section and its content region. The bar with the title is not
 * here: below 768 px the header of the page is in the bar, so the counter row is the first line of the frame, as in the app.
 * The rules that give the frame its box are in `tokens.css` and match on this structure.
 */
function PageFrame(props: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-480 flex-col overflow-x-clip bg-background text-foreground md:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 pb-4 pt-4 md:px-6 md:pb-6 md:pt-6 xl:px-10 tall-window:pb-[var(--bar-reserve,calc(4rem+env(safe-area-inset-bottom)))]">
          <div className="mx-auto w-full max-w-180">
            <div data-fit-screen="" data-fit-fill="" className="flex min-h-0 min-w-0 flex-col">
              <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">{props.children}</div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** The deck with two cards in the frame of the page; no answer ever arrives. */
export function FramedDeck() {
  return (
    <PageFrame>
      <MatchDeck
        cards={[CARD, SECOND]}
        entries={[]}
        onYes={never}
        onAnswer={never}
        onUndo={never}
      />
    </PageFrame>
  );
}
