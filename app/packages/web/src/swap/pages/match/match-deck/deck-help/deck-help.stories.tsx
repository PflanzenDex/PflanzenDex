import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MatchCard } from "@pflanzendex/core";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { MatchDeck } from "../match-deck";
import { judgeInfoButton } from "./deck-help.play";

// The info button of the match deck in the frame of the page (US-QS-15, SG-TOUCH-01, DS-37, issue 2611): its whole 44 px target
// and its focus ring stand inside the frame, clear of the counter text and of the card. The play measures the real boxes, so the
// browser run (`make sb-test`, the conformance) judges it; jsdom has no layout and the play returns before its first measure.
const meta = {
  title: "swap/MatchDeck/DeckHelp",
  component: Deck,
  decorators: [withRouter],
} satisfies Meta<typeof Deck>;

export default meta;
type Story = StoryObj<typeof meta>;

const CARD: MatchCard = {
  ownerId: "u1",
  ownerName: "Ben",
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

function Deck() {
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

// At the normal text size: the first line of the frame holds the counter and the info button.
export const InfoButtonInFrame: Story = {
  render: () => <Deck />,
  play: async ({ canvasElement }) => judgeInfoButton(canvasElement),
};

// At 200 % text (set before the deck mounts, because the deck reads the size once): the same boxes stand clear.
export const InfoButtonAtLargeText: Story = {
  render: () => <Deck />,
  beforeEach: () => {
    const root = document.documentElement;
    root.style.setProperty("font-size", "200%", "important");
    return () => root.style.removeProperty("font-size");
  },
  play: async ({ canvasElement }) => judgeInfoButton(canvasElement),
};
