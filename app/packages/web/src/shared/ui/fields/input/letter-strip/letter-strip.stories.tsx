import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
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
    label: "Zum Buchstaben springen",
    present: new Set(["A", "B", "D", "M", "#"]),
    onJump: () => undefined,
  },
} satisfies Meta<typeof LetterStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

const stripOf = (canvas: HTMLElement) =>
  must(canvas.querySelector<HTMLElement>('[role="slider"]'), "the letter strip");

const place = (strip: HTMLElement, letter: string) =>
  must(
    Array.from(strip.children).find((el) => el.textContent === letter),
    `the place of ${letter}`,
  );

// The strip is one slider with a name and 27 places; the letters with an entry are in the primary colour, the others dimmed
// but kept; it is as wide as a touch target and as high as its frame.
export const Default: Story = {
  play: ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    check(strip.getAttribute("aria-label") === "Zum Buchstaben springen", "the strip has no name");
    check(strip.children.length === 27, "the strip has not 27 places");
    check(place(strip, "A").className.includes("text-primary"), "a letter with entries is dimmed");
    check(
      place(strip, "C").className.includes("text-muted-foreground"),
      "a letter without entries is not dimmed",
    );
    const box = strip.getBoundingClientRect();
    const measured = hasLayout(strip);
    check(!measured || box.width >= 44, `the strip is ${box.width} px wide, below 44`);
    check(!measured || box.height >= 350, "the strip is not as high as its frame");
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
  play: async ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    const [present, absent] = LOOKS.entries;
    const [, thinned] = LOOKS.label;
    const looks = () => Array.from(strip.children).map((el) => el.className);
    check(
      looks().some((c) => c.includes("text-primary")),
      `no place is ${present}`,
    );
    check(
      looks().some((c) => c.includes("text-muted-foreground")),
      `no place is ${absent}`,
    );
    check(strip.children.length === 27, "a thinned strip lost places");
    // The labels thin out in a ResizeObserver callback after the first layout: wait for it.
    await waitUntil(
      () => !hasLayout(strip) || looks().some((c) => c.includes("invisible")),
      `a label is ${thinned} in a short strip`,
    );
  },
};

// A strip without any letter with an entry has no value to say and nothing to jump to.
export const NoEntries: Story = {
  args: { present: new Set<string>() },
  play: ({ canvasElement }) => {
    check(stripOf(canvasElement).getAttribute("aria-valuetext") === "", "the strip says a letter");
    return Promise.resolve();
  },
};
