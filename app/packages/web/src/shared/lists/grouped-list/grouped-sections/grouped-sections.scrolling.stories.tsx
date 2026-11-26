import type { Meta, StoryObj } from "@storybook/react-vite";
import { hasLayout, waitUntil } from "@/shared/testing/story-frame/story-play";
import {
  ARGS,
  GROUPS,
  group,
  inFrame,
  plants,
  regionOf,
  sectionsOf,
  text200,
} from "./grouped-sections.parts";
import { GroupSections } from "./grouped-sections";

// The scrolling of the grouped sections (US-QS-15, SG-LIST-06): the sticky heading, the jump of a chip and a long heading at
// 200 % text. The plays measure the layout, so they return early without one (jsdom) and the browser run judges them.
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
    if (!hasLayout(region)) return;
    const [, second] = sectionsOf(canvasElement);
    const heading = second?.querySelector<HTMLElement>("[data-group-heading]");
    if (!second || !heading) throw new Error("play: the second group is missing");
    // The middle of the second section: its heading must stand at the top of the region while its rows pass.
    region.scrollTop += offsetOf(second, region) + 60;
    await waitUntil(
      () => Math.abs(offsetOf(heading, region)) < 2,
      "the heading sticks to the top of the region",
    );
    const style = getComputedStyle(heading);
    if (style.position !== "sticky") throw new Error(`play: the heading is ${style.position}`);
    if (style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent")
      throw new Error("play: the sticky heading is transparent, rows show through");
  },
};

// A tap on a chip scrolls that section to the top of the region; the other groups stay on the page.
export const Jump: Story = {
  play: async ({ canvasElement }) => {
    const region = regionOf(canvasElement);
    if (!hasLayout(region)) return;
    const chip = Array.from(canvasElement.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Wohnzimmer"),
    );
    const third = sectionsOf(canvasElement)[2];
    if (!chip || !third) throw new Error("play: the chip or its group is missing");
    chip.click();
    await waitUntil(
      () => Math.abs(offsetOf(third, region)) < 2,
      "the section stands at the top",
      3000,
    );
    if (sectionsOf(canvasElement).length !== GROUPS.length)
      throw new Error("play: a jump hid a group");
  },
};

const LONG = "Wohnzimmer am Nordfenster neben der Heizung und dem Bücherregal";

// At 200 % text a long heading wraps. It covers at most a third of the region; where it would cover more it is no longer sticky
// (WCAG 1.4.4, 2.4.11), and the play checks that the switch and the position agree.
export const LongHeadingAt200: Story = {
  decorators: [text200],
  args: {
    groups: [group("a", LONG, plants("Efeu", 6)), group("b", "Küche", plants("Basilikum", 6))],
  },
  play: async ({ canvasElement }) => {
    const region = regionOf(canvasElement);
    if (!hasLayout(region)) return;
    const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (size < 31) throw new Error(`play: the text is ${size} px, not 200 %`);
    const box = canvasElement.querySelector<HTMLElement>("[data-sticky]");
    const heading = canvasElement.querySelector<HTMLElement>("[data-group-heading]");
    if (!box || !heading) throw new Error("play: the sections are missing");
    await waitUntil(() => box.dataset["sticky"] !== undefined, "the switch is set");
    const covers = heading.offsetHeight * 3 > region.clientHeight;
    const sticky = getComputedStyle(heading).position === "sticky";
    if (covers && sticky)
      throw new Error("play: a heading that covers over a third of the region sticks");
    if (!covers && !sticky) throw new Error("play: a heading that leaves room does not stick");
    if (heading.scrollWidth > heading.clientWidth + 1)
      throw new Error("play: the heading is cut at 200 % text");
  },
};
