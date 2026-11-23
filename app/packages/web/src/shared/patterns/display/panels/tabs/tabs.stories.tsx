import type { Meta, StoryObj } from "@storybook/react-vite";
import { hasLayout, waitUntil } from "@/shared/testing/story-frame/story-play";
import { Tabs } from "./tabs";

// Catalog of Tabs (TE-18, US-QS-07). Light and dark come from the theme toolbar. Focus the selected tab with Tab, then
// move with the arrow keys, Home and End.
const meta = {
  title: "data-display/Tabs",
  component: Tabs,
  args: {
    label: "Pflegeprofil",
    tabs: [
      { value: "licht", label: "Licht", content: "Heller Standort ohne direkte Mittagssonne." },
      {
        value: "wasser",
        label: "Wasser",
        content: "Gießen, wenn die oberen Zentimeter trocken sind.",
      },
      { value: "boden", label: "Boden", content: "Lockere, durchlässige Erde." },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SecondSelected: Story = { args: { defaultValue: "wasser" } };

export const ManyTabsNarrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    tabs: ["Übersicht", "Pflege", "Messungen", "Fotos", "Notizen"].map((label) => ({
      value: label,
      label,
      content: `Inhalt: ${label}`,
    })),
  },
};

/** True when the tab lies inside the visible box of the strip and the strip has scrolled sideways to reach it. */
function inStrip(strip: HTMLElement, tab: HTMLElement): boolean {
  const box = strip.getBoundingClientRect();
  const at = tab.getBoundingClientRect();
  return at.left >= box.left - 0.5 && at.right <= box.right + 0.5 && strip.scrollLeft > 0;
}

// The selected tab is the last of a strip that scrolls: on load the strip scrolls it into view (DS-63, issue 2417; US-QS-15).
// The play function fails the story when the strip does not overflow or the tab stays out of view (P-B, issue 2432).
export const ActiveTabInView: Story = {
  ...ManyTabsNarrow,
  args: { ...ManyTabsNarrow.args, defaultValue: "Notizen" },
  play: async ({ canvasElement }) => {
    const strip = canvasElement.querySelector<HTMLElement>('[role="tablist"]');
    const selected = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !selected) throw new Error("play: the tab strip or its selected tab is missing");
    // jsdom has no layout; the browser run of the conformance measures the scroll.
    if (!hasLayout(strip)) return;
    if (strip.scrollWidth <= strip.clientWidth)
      throw new Error("play: the strip does not overflow, so the story proves nothing");
    await waitUntil(() => inStrip(strip, selected), "the selected tab scrolls into the strip");
  },
};
