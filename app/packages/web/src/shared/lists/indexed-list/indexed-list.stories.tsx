import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { hasLayout, waitUntil } from "@/shared/testing/story-frame/story-play";
import { IndexedList } from "./indexed-list";

// Catalog of the letter index of a long list sorted by name (US-QS-15, SG-LIST-06, issue 2419). Each story has a play function
// that the QG-U5 conformance run waits for (P-B, issue 2432); a story fails when its play throws.
const names = [
  ...Array.from({ length: 60 }, (_, i) => `Aloe ${String(i).padStart(2, "0")}`),
  ...Array.from({ length: 50 }, (_, i) => `Begonie ${String(i).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, i) => `Dracaena ${i}`),
];

/** The frame of a screen: a box of fixed height that the list fills and scrolls in (DS-58). */
const inFrame: Decorator = (Story) => (
  <div className="flex h-[480px] w-[360px] flex-col bg-background p-4">
    <Story />
  </div>
);

function List({ rows, byName }: { rows: readonly string[]; byName: boolean }) {
  return (
    <IndexedList items={rows} nameOf={(n) => n} byName={byName} label="Springen zu Buchstabe">
      <ul
        aria-label="Arten"
        data-scroll-region=""
        tabIndex={0}
        className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0"
      >
        {rows.map((n) => (
          <li key={n} className="flex min-h-11 items-center border-b border-border px-2">
            {n}
          </li>
        ))}
      </ul>
    </IndexedList>
  );
}

const meta = {
  title: "lists/IndexedList",
  component: List,
  decorators: [inFrame],
  args: { rows: names, byName: true },
} satisfies Meta<typeof List>;

export default meta;
type Story = StoryObj<typeof meta>;

function stripOf(canvas: HTMLElement): HTMLElement | null {
  return canvas.querySelector<HTMLElement>('[role="slider"]');
}

function listOf(canvas: HTMLElement): HTMLElement {
  const list = canvas.querySelector<HTMLElement>("ul[aria-label]");
  if (!list) throw new Error("play: the list is missing");
  return list;
}

// The strip stands beside the list: one slider with a name, 27 places, the letters without an entry dimmed and kept; it is as
// wide as a touch target and as high as the list, and the list gives up its width.
export const Default: Story = {
  play: ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    if (!strip) throw new Error("play: the letter index is missing");
    if (strip.getAttribute("aria-label") !== "Springen zu Buchstabe")
      throw new Error("play: the strip has no name");
    if (strip.children.length !== 27) throw new Error("play: the strip has not 27 places");
    const letter = (l: string) =>
      Array.from(strip.children).find((el) => el.textContent === l) as HTMLElement;
    if (!letter("B").className.includes("text-primary"))
      throw new Error("play: a letter with entries is dimmed");
    if (!letter("C").className.includes("text-muted-foreground"))
      throw new Error("play: a letter without entries is not dimmed");
    if (hasLayout(strip)) {
      const box = strip.getBoundingClientRect();
      const list = listOf(canvasElement).getBoundingClientRect();
      if (box.width < 44) throw new Error(`play: the strip is ${box.width} px wide, below 44`);
      if (box.height < list.height - 2) throw new Error("play: the strip is shorter than the list");
      if (box.left < list.right - 1) throw new Error("play: the strip covers the list");
    }
    return Promise.resolve();
  },
};

// The keyboard has the same: Home and End and the arrow keys jump the list, with one tab stop for the strip.
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    if (!strip) throw new Error("play: the letter index is missing");
    strip.focus();
    strip.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await waitUntil(() => strip.getAttribute("aria-valuetext") === "D", "the strip says D");
    const list = listOf(canvasElement);
    if (hasLayout(list)) {
      await waitUntil(() => list.scrollTop > 0, "the list scrolls to D");
      const first = list.children.item(110)?.getBoundingClientRect();
      if (!first || Math.abs(first.top - list.getBoundingClientRect().top) > 2)
        throw new Error("play: the first entry of D does not stand at the top of the list");
    }
  },
};

// A list that is not sorted by name, or that has 100 rows or fewer, has no strip.
export const Hidden: Story = {
  args: { byName: false },
  play: ({ canvasElement }) => {
    if (stripOf(canvasElement)) throw new Error("play: a list not sorted by name has a strip");
    return Promise.resolve();
  },
};

// At 200 % text the strip keeps its 27 places and thins its labels so that none overlap: the labels that show do not run into
// each other, and the strip does not grow past the list.
export const At200: Story = {
  decorators: [withText200],
  play: async ({ canvasElement }) => {
    const strip = stripOf(canvasElement);
    if (!strip) throw new Error("play: the letter index is missing");
    if (!hasLayout(strip)) return;
    await waitUntil(() => strip.scrollHeight > 0, "the strip is laid out");
    if (strip.scrollHeight > strip.clientHeight + 1)
      throw new Error("play: the letters do not fit the strip at 200 % text");
    const shown = Array.from(strip.children)
      .filter((el) => !el.className.includes("invisible"))
      .map((el) => el.getBoundingClientRect());
    for (let i = 1; i < shown.length; i += 1) {
      const [a, b] = [shown[i - 1], shown[i]] as [DOMRect, DOMRect];
      if (b.top < a.bottom - 1) throw new Error("play: two letters overlap at 200 % text");
    }
  },
};
