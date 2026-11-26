import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
import { IndexedList } from "./indexed-list";

// Catalog of the letter index of a long list sorted by name (US-QS-15, SG-LIST-11, issue 2419). Each story has a play function
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

const stripOf = (canvas: HTMLElement) => canvas.querySelector<HTMLElement>('[role="slider"]');
const listOf = (canvas: HTMLElement) =>
  must(canvas.querySelector<HTMLElement>("ul[aria-label]"), "the list");

// The strip stands beside the list: one slider with a name, 27 places, the letters without an entry dimmed and kept; it is as
// wide as a touch target and as high as the list, and the list gives up its width.
export const Default: Story = {
  play: ({ canvasElement }) => {
    const strip = must(stripOf(canvasElement), "the letter index");
    check(strip.getAttribute("aria-label") === "Springen zu Buchstabe", "the strip has no name");
    check(strip.children.length === 27, "the strip has not 27 places");
    const letter = (l: string) =>
      must(
        Array.from(strip.children).find((el) => el.textContent === l),
        `the place of ${l}`,
      );
    check(letter("B").className.includes("text-primary"), "a letter with entries is dimmed");
    check(
      letter("C").className.includes("text-muted-foreground"),
      "a letter without entries is not dimmed",
    );
    const measured = hasLayout(strip);
    const box = strip.getBoundingClientRect();
    const list = listOf(canvasElement).getBoundingClientRect();
    check(!measured || box.width >= 44, `the strip is ${box.width} px wide, below 44`);
    check(!measured || box.height >= list.height - 2, "the strip is shorter than the list");
    check(!measured || box.left >= list.right - 1, "the strip covers the list");
    return Promise.resolve();
  },
};

// The keyboard has the same: Home and End and the arrow keys jump the list, with one tab stop for the strip.
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const strip = must(stripOf(canvasElement), "the letter index");
    strip.focus();
    strip.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await waitUntil(() => strip.getAttribute("aria-valuetext") === "D", "the strip says D");
    const list = listOf(canvasElement);
    const measured = hasLayout(list);
    await waitUntil(() => !measured || list.scrollTop > 0, "the list scrolls to D");
    // The first entry of D stands at the top of the list, or the list is at its end: D has only six entries, fewer than fill the box.
    const first = list.children.item(110)?.getBoundingClientRect();
    const top = list.getBoundingClientRect().top;
    const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
    check(
      !measured || atEnd || (first !== undefined && Math.abs(first.top - top) <= 2),
      "the first entry of D does not stand at the top of the list",
    );
  },
};

// A list that is not sorted by name, or that has 100 rows or fewer, has no strip.
export const Hidden: Story = {
  args: { byName: false },
  play: ({ canvasElement }) => {
    check(stripOf(canvasElement) === null, "a list not sorted by name has a strip");
    return Promise.resolve();
  },
};

// At 200 % text the strip keeps its 27 places and thins its labels so that none overlap: the labels that show do not run into
// each other, and the strip does not grow past the list.
export const At200: Story = {
  decorators: [withText200],
  play: async ({ canvasElement }) => {
    const strip = must(stripOf(canvasElement), "the letter index");
    const measured = hasLayout(strip);
    await waitUntil(() => !measured || strip.scrollHeight > 0, "the strip is laid out");
    check(
      strip.scrollHeight <= strip.clientHeight + 1,
      "the letters do not fit the strip at 200 % text",
    );
    const shown = Array.from(strip.children)
      .filter((el) => !el.className.includes("invisible"))
      .map((el) => el.getBoundingClientRect());
    const overlap = shown.some((box, i) => i > 0 && box.top < (shown[i - 1]?.bottom ?? 0) - 1);
    check(!measured || !overlap, "two letters overlap at 200 % text");
  },
};
