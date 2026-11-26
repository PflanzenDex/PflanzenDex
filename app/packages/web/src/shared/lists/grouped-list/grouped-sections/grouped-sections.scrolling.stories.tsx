import type { Meta, StoryObj } from "@storybook/react-vite";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
import {
  ARGS,
  GROUPS,
  group,
  inFrame,
  plants,
  regionOf,
  sectionsOf,
} from "./grouped-sections.parts";
import { GroupSections } from "./grouped-sections";

// The scrolling of the grouped sections (US-QS-15, SG-LIST-06): the sticky heading, the jump of a chip and a long heading at
// 200 % text. The plays measure the layout in the browser; without one (jsdom) their measures pass, and the conformance run
// judges them.
const meta = {
  title: "lists/GroupedSectionsScrolling",
  component: GroupSections<string>,
  decorators: [inFrame],
  args: ARGS,
} satisfies Meta<typeof GroupSections<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A section's top edge minus the top edge of the region: 0 when the section stands at the top. */
const offsetOf = (section: Element, region: Element) =>
  section.getBoundingClientRect().top - region.getBoundingClientRect().top;

// The heading of the group that passes sticks under the top of the region, on an opaque surface, and the next heading
// pushes it out; at 200 % text a heading that covers too much of the region stays in the flow (the last story).
export const StickyHeading: Story = {
  play: async ({ canvasElement }) => {
    const region = regionOf(canvasElement);
    const measured = hasLayout(region);
    const second = must(sectionsOf(canvasElement)[1], "the second group");
    const heading = must(second.querySelector<HTMLElement>("[data-group-heading]"), "its heading");
    // The middle of the second section: its heading must stand at the top of the region while its rows pass.
    region.scrollTop += offsetOf(second, region) + 60;
    await waitUntil(
      () => !measured || Math.abs(offsetOf(heading, region)) < 2,
      "the heading sticks to the top of the region",
    );
    const style = getComputedStyle(heading);
    check(!measured || style.position === "sticky", `the heading is ${style.position}`);
    // A computed colour reads "rgb(r, g, b)" or with a fourth number for the alpha: 0 means the rows show through.
    const [, , , alpha] = style.backgroundColor.match(/[\d.]+/g) ?? [];
    const clear = style.backgroundColor === "transparent" || alpha === "0";
    check(!measured || !clear, "the sticky heading is transparent, rows show through");
  },
};

/**
 * Chooses the group `key` as a keeper does: a tap on its chip, or its option in the selection field where the chips do not fit the
 * row (a phone shows the field from three groups on). The hidden measuring row of the chips is no chip.
 */
function choose(canvas: HTMLElement, label: string, key: string): void {
  const select = canvas.querySelector<HTMLSelectElement>("select");
  if (select === null) {
    const row = must(canvas.querySelector<HTMLElement>('[role="group"]'), "the chips");
    must(
      Array.from(row.querySelectorAll("button")).find((b) => b.textContent?.startsWith(label)),
      `the chip ${label}`,
    ).click();
    return;
  }
  select.value = key;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

// A tap on a chip (or a choice in the selection field) scrolls that section to the top of the region; the other groups stay on
// the page.
export const Jump: Story = {
  play: async ({ canvasElement }) => {
    const region = regionOf(canvasElement);
    const measured = hasLayout(region);
    const third = must(sectionsOf(canvasElement)[2], "its group");
    choose(canvasElement, "Wohnzimmer", "c");
    await waitUntil(
      () => !measured || Math.abs(offsetOf(third, region)) < 2,
      "the section stands at the top",
      3000,
    );
    check(sectionsOf(canvasElement).length === GROUPS.length, "a jump hid a group");
  },
};

const LONG = "Wohnzimmer am Nordfenster neben der Heizung und dem Bücherregal";

// At 200 % text a long heading wraps. It covers at most a third of the region; where it would cover more it is no longer sticky
// (WCAG 1.4.4, 2.4.11), and the play checks that the switch and the position agree.
export const LongHeadingAt200: Story = {
  decorators: [withText200],
  args: {
    groups: [group("a", LONG, plants("Efeu", 6)), group("b", "Küche", plants("Basilikum", 6))],
  },
  play: async ({ canvasElement }) => {
    const region = regionOf(canvasElement);
    const measured = hasLayout(region);
    const size = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
    await waitUntil(() => !measured || size() >= 31, "the text is 200 %");
    const box = must(canvasElement.querySelector<HTMLElement>("[data-sticky]"), "the sections");
    const heading = must(
      canvasElement.querySelector<HTMLElement>("[data-group-heading]"),
      "a heading",
    );
    await waitUntil(() => box.dataset["sticky"] !== undefined, "the switch is set");
    const covers = heading.offsetHeight * 3 > region.clientHeight;
    const sticky = getComputedStyle(heading).position === "sticky";
    check(
      !measured || !(covers && sticky),
      "a heading that covers over a third of the region sticks",
    );
    check(!measured || covers || sticky, "a heading that leaves room does not stick");
    check(heading.scrollWidth <= heading.clientWidth + 1, "the heading is cut at 200 % text");
  },
};
