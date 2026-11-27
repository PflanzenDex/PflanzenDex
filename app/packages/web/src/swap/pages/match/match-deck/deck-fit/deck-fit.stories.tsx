import type { Meta, StoryObj } from "@storybook/react-vite";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { FramedDeck } from "./deck-fit.frame";
import { judgeDeckFit } from "./deck-fit.play";

// The card of the match deck in the frame of the phone, 360 x 640 px (US-QS-15, US-TAU-01, SG-TYPE-04, issue 2637): at the normal
// text size the card takes the free height and the decision buttons sit below it; at 200 % text the card keeps the height of its
// content, the frame scrolls, and the buttons never lie over the card. The play measures the real boxes, so the browser run
// (`make sb-test`, the conformance) judges it; jsdom has no layout and the play returns before its first measure.
const meta = {
  title: "swap/MatchDeck/DeckFit",
  component: FramedDeck,
  decorators: [withRouter],
} satisfies Meta<typeof FramedDeck>;

export default meta;
type Story = StoryObj<typeof meta>;

// At the normal text size: the card fills the free height of the one-screen frame, the buttons stand below it, nothing scrolls.
export const CardFillsFrame: Story = {
  render: () => <FramedDeck />,
  play: async ({ canvasElement }) => judgeDeckFit(canvasElement, "normal"),
};

// At 200 % text (set before the deck mounts): the card is as high as its content and the buttons follow it below.
export const CardKeepsContentAtLargeText: Story = {
  render: () => <FramedDeck />,
  beforeEach: () => {
    const root = document.documentElement;
    root.style.setProperty("font-size", "200%", "important");
    return () => root.style.removeProperty("font-size");
  },
  play: async ({ canvasElement }) => judgeDeckFit(canvasElement, "large"),
};
