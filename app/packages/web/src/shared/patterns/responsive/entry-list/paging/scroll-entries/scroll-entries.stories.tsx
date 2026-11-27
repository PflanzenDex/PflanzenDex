import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { hasLayout, waitUntil } from "@/shared/testing/story-frame/story-play";
import { ScrollEntries } from "./scroll-entries";
import type { EntriesPaging } from "../paging";

// Catalog of the scrolling list (US-QS-15, SG-LIST-01, DS-60): the end of the list in its four states. Each story has a
// play function that the QG-U5 conformance run waits for (P-B, issue 2432); a story fails when its play throws.
const plants = (count: number) => Array.from({ length: count }, (_, i) => `Monstera ${i + 1}`);

function paging(over: Partial<EntriesPaging> = {}): EntriesPaging {
  return {
    total: 20,
    loading: false,
    onMore: () => undefined,
    onRetry: () => undefined,
    loadingText: "Pflanzen werden geladen …",
    retryText: "Erneut versuchen",
    ...over,
  };
}

/** The frame of a screen: a box of fixed height that the list fills and scrolls in (DS-58). */
const inFrame: Decorator = (Story) => (
  <MemoryRouter>
    <div className="flex h-[360px] w-full flex-col p-4">
      <Story />
    </div>
  </MemoryRouter>
);

const meta = {
  title: "shared/ScrollEntries",
  component: ScrollEntries<string>,
  decorators: [inFrame],
  args: {
    items: plants(8),
    pageSize: 10,
    label: "Pflanzen",
    fit: true,
    renderItem: (name: string) => (
      <p className="rounded-lg border border-border p-3 font-semibold">{name}</p>
    ),
  },
} satisfies Meta<typeof ScrollEntries<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The box that scrolls. */
function listOf(canvas: HTMLElement): HTMLElement {
  const list = canvas.querySelector<HTMLElement>("ul[aria-label]");
  if (!list) throw new Error("play: the list is missing");
  return list;
}

const marker = (list: HTMLElement) => /Das waren alle/.test(list.textContent ?? "");

// A part is on its way (the default story): a spinner without visible text; a screen reader hears "Weitere werden geladen …", and the row
// takes no focus (SG-LIST-01). Reduced motion stops the spinner (the conformance run emulates it).
export const Loading: Story = {
  args: { paging: paging({ loading: true }) },
  play: async ({ canvasElement }) => {
    await waitUntil(
      () => canvasElement.querySelector('[role="status"]') !== null,
      "the loader row shows",
      3000,
    );
    const status = canvasElement.querySelector<HTMLElement>('[role="status"]');
    const row = status?.closest("li");
    if (!status || !row) throw new Error("play: the loader row is missing");
    if (status.textContent !== "Weitere werden geladen …")
      throw new Error(`play: the loader row says "${status.textContent}"`);
    if (row.querySelector("a, button, input, select, textarea, [tabindex]"))
      throw new Error("play: the loader row has a focusable part");
    if (!hasLayout(row)) return;
    const text = status.querySelector<HTMLElement>(".sr-only")?.getBoundingClientRect();
    if (!text || text.width > 1 || text.height > 1)
      throw new Error("play: the loader row shows text to the eye");
    if (!row.querySelector("svg")?.getClientRects().length)
      throw new Error("play: the loader row shows no spinner");
  },
};

// Every entry is there, the count is known and the list is longer than its box: the list ends with "Das waren alle 20",
// calm text that is no control, and the marker is fully in view at the end of the list (SG-LIST-02).
export const EndMarker: Story = {
  args: { items: plants(20), paging: paging({ total: 20 }) },
  play: async ({ canvasElement }) => {
    const list = listOf(canvasElement);
    if (!hasLayout(list)) return;
    if (list.scrollHeight <= list.clientHeight)
      throw new Error("play: the list does not overflow, so the story proves nothing");
    await waitUntil(() => marker(list), "the end marker shows after the settle", 3000);
    const last = list.lastElementChild as HTMLElement;
    if (last.textContent !== "Das waren alle 20")
      throw new Error(`play: the end marker says "${last.textContent}"`);
    if (last.querySelector("a, button, input, [tabindex]"))
      throw new Error("play: the end marker is a control");
    list.scrollTop = list.scrollHeight;
    const box = list.getBoundingClientRect();
    const at = last.getBoundingClientRect();
    if (at.bottom > box.bottom + 1 || at.top < box.top)
      throw new Error("play: the end marker is not fully in view at the end of the list");
  },
};

/** Waits longer than the settle of the marker (120 ms) and fails when the list ends with a marker; `long`: the list must overflow, else it proves nothing. */
async function expectNoMarker(canvas: HTMLElement, long: boolean): Promise<void> {
  const list = listOf(canvas);
  if (long && hasLayout(list) && list.scrollHeight <= list.clientHeight)
    throw new Error("play: the list does not overflow, so the story proves nothing");
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (marker(list)) throw new Error("play: the list ends with a marker it must not have");
}

// A short list that fits without scrolling has no marker.
export const ShortList: Story = {
  args: { items: plants(3), paging: paging({ total: 3 }) },
  play: ({ canvasElement }) => expectNoMarker(canvasElement, false),
};

// The count is not known (P-08): no marker, however long the list is.
export const UnknownCount: Story = {
  args: { items: plants(20), paging: paging({ total: undefined }) },
  play: ({ canvasElement }) => expectNoMarker(canvasElement, true),
};

// A filtered list ends with the filtered count, in the same form (the caller passes the total of the filter).
export const Filtered: Story = {
  args: { items: plants(9), paging: paging({ total: 9 }), resetKey: "Wohnzimmer" },
  play: async ({ canvasElement }) => {
    const list = listOf(canvasElement);
    if (!hasLayout(list)) return;
    await waitUntil(() => marker(list), "the end marker of the filtered list shows", 3000);
    if (list.lastElementChild?.textContent !== "Das waren alle 9")
      throw new Error("play: the filtered list does not end with its own count");
  },
};

const rectOf = (element: Element) => element.getBoundingClientRect();

/** Waits for the retry row of the story and returns its sentence, its row and its button. */
async function retryRow(canvas: HTMLElement) {
  const find = () => canvas.querySelector<HTMLElement>('[role="alert"]');
  await waitUntil(() => find() !== null, "the retry row shows");
  const sentence = find();
  const row = sentence?.closest("li");
  const button = row?.querySelector("button");
  if (!sentence || !row || !button) throw new Error("play: the retry row is incomplete");
  return { sentence, row, button };
}

// A failed part: "Der Rest konnte nicht geladen werden." and "Erneut versuchen"; the entries stay (P-10).
export const RetryRow: Story = {
  args: { items: plants(4), paging: paging({ total: 20, failure: "" }) },
  play: async ({ canvasElement }) => {
    const { sentence, button } = await retryRow(canvasElement);
    if (sentence.textContent !== "Der Rest konnte nicht geladen werden.")
      throw new Error(`play: the retry row says "${sentence.textContent}"`);
    if (button.textContent !== "Erneut versuchen")
      throw new Error(`play: the retry button says "${button.textContent}"`);
    if (canvasElement.querySelectorAll("li").length < 5)
      throw new Error("play: the loaded entries are gone");
  },
};

// The same row at 200 % text on a phone: the sentence stands above the button, nothing is cut, nothing runs sideways.
export const RetryRowAt200: Story = {
  ...RetryRow,
  decorators: [withText200],
  play: async ({ canvasElement }) => {
    const { sentence, row, button } = await retryRow(canvasElement);
    if (!hasLayout(row)) return;
    const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (size < 31) throw new Error(`play: the text is ${size} px, not 200 %`);
    const [text, control, box] = [sentence, button, row].map(rectOf) as [DOMRect, DOMRect, DOMRect];
    if (control.top < text.bottom - 1)
      throw new Error("play: the button does not stand below the sentence at 200 % text");
    if (control.left < box.left - 1 || control.right > box.right + 1)
      throw new Error("play: the button leaves its row at 200 % text");
    if (sentence.scrollWidth > sentence.clientWidth + 1 || row.scrollWidth > row.clientWidth + 1)
      throw new Error("play: the retry row is cut at 200 % text");
  },
};
