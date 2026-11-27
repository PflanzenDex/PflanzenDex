import type { Meta, StoryObj } from "@storybook/react-vite";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { FramedDeck } from "../deck-fit/deck-fit.frame";
import { judgeInfoButton } from "./deck-help.play";

// The info button of the match deck in the frame of the page (US-QS-15, SG-TOUCH-01, DS-37, issue 2611): its whole 44 px target
// and its focus ring stand inside the frame, clear of the counter text and of the card. The play measures the real boxes, so the
// browser run (`make sb-test`, the conformance) judges it; jsdom has no layout and the play returns before its first measure.
const meta = {
  title: "swap/MatchDeck/DeckHelp",
  component: FramedDeck,
  decorators: [withRouter],
} satisfies Meta<typeof FramedDeck>;

export default meta;
type Story = StoryObj<typeof meta>;

// At the normal text size: the first line of the frame holds the counter and the info button.
export const InfoButtonInFrame: Story = {
  render: () => <FramedDeck />,
  play: async ({ canvasElement }) => judgeInfoButton(canvasElement),
};

// At 200 % text (set before the deck mounts; the deck follows a later change too, issue 2617): the same boxes stand clear.
export const InfoButtonAtLargeText: Story = {
  render: () => <FramedDeck />,
  beforeEach: () => {
    const root = document.documentElement;
    root.style.setProperty("font-size", "200%", "important");
    return () => root.style.removeProperty("font-size");
  },
  play: async ({ canvasElement }) => judgeInfoButton(canvasElement),
};
