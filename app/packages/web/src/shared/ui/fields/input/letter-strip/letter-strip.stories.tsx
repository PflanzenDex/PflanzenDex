import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { hasLayout, waitUntil } from "@/shared/testing/story-frame/story-play";
import { LetterStrip } from "./letter-strip";

// Catalog of the letter strip (US-QS-15, SG-LIST-11, issue 2419): one slider with 27 places, the letters without an entry
// dimmed. Each story has a play function that the QG-U5 conformance run waits for (P-B, issue 2432).
const inFrame: Decorator = (Story) => (
  <div className="flex h-[400px] w-[360px] justify-end bg-background p-4">
    <Story />
  </div>
);

const meta = {
  title: "ui/LetterStrip",
  component: LetterStrip,
  decorators: [inFrame],
  args: {
    label: "Springen zu Buchstabe",
    present: new Set(["A", "B", "D", "M", "#"]),
    onJump: () => undefined,
  },
} satisfies Meta<typeof LetterStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

function stripOf(canvas: HTMLElement): HTMLElement {
  const strip = canvas.querySelector<HTMLElement>('[role="slider"]');
  if (!strip) throw new Error("play: the letter strip is missing");
  return strip;
}

// The strip is one slider with a name and 27 places; the letters with an entry are in the primary colour, the others dimmed
// but kept; it is as wide as a touch target and as high as its frame.
export const Default: Story = {
  play: ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    if (strip.getAttribute("aria-label") !== "Springen zu Buchstabe")
      throw new Error("play: the strip has no name");
    if (strip.children.length !== 27) throw new Error("play: the strip has not 27 places");
    const letter = (l: string) =>
      Array.from(strip.children).find((el) => el.textContent === l) as HTMLElement;
    if (!letter("A").className.includes("text-primary"))
      throw new Error("play: a letter with entries is dimmed");
    if (!letter("C").className.includes("text-muted-foreground"))
      throw new Error("play: a letter without entries is not dimmed");
    if (hasLayout(strip)) {
      const box = strip.getBoundingClientRect();
      if (box.width < 44) throw new Error(`play: the strip is ${box.width} px wide, below 44`);
      if (box.height < 350) throw new Error("play: the strip is not as high as its frame");
    }
    return Promise.resolve();
  },
};

// The keyboard steps through the letters that have an entry: End goes to the last one, and the value text says it.
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    strip.focus();
    strip.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await waitUntil(() => strip.getAttribute("aria-valuetext") === "#", "the strip says #");
    strip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await waitUntil(() => strip.getAttribute("aria-valuetext") === "M", "the strip says M");
  },
};

/** The looks of a place of the strip: with or without an entry, and its label shown or thinned out. */
const LOOKS = { entries: ["present", "absent"], label: ["shown", "thinned"] } as const;

/** A frame too short for 27 labels of 12 px: the labels thin out and the 27 places stay. */
const short: Decorator = (Story) => (
  <div className="flex h-[160px] w-[360px] justify-end bg-background p-4">
    <Story />
  </div>
);

// Every look of a place: a letter with an entry (present) in the primary colour, one without (absent) dimmed, and in a strip too
// short for 27 labels every other label thinned out (the places stay, only their label is invisible).
export const AllVariants: Story = {
  decorators: [short],
  play: ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    const [present, absent] = LOOKS.entries;
    const colours = Array.from(strip.children).map((el) => el.className);
    if (!colours.some((c) => c.includes("text-primary")))
      throw new Error(`play: no place is ${present}`);
    if (!colours.some((c) => c.includes("text-muted-foreground")))
      throw new Error(`play: no place is ${absent}`);
    if (strip.children.length !== 27) throw new Error("play: a thinned strip lost places");
    if (hasLayout(strip)) {
      const [, thinned] = LOOKS.label;
      if (!colours.some((c) => c.includes("invisible")))
        throw new Error(`play: no label is ${thinned} in a short strip`);
    }
    return Promise.resolve();
  },
};

// A strip without any letter with an entry has no value to say and nothing to jump to.
export const NoEntries: Story = {
  args: { present: new Set<string>() },
  play: ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    if (strip.getAttribute("aria-valuetext") !== "")
      throw new Error("play: the strip says a letter");
    return Promise.resolve();
  },
};
