import type { Meta, StoryObj } from "@storybook/react-vite";
import { ARGS, GROUPS, group, inFrame, plants, sectionsOf } from "./grouped-sections.parts";
import { GroupSections, type SectionGroup } from "./grouped-sections";

// Catalog of the grouped list as sections of one scrolling list (US-QS-15, SG-LIST-06, SG-LIST-08, issue 2419). Each story
// has a play function that the QG-U5 conformance run waits for (P-B, issue 2432); a story fails when its play throws.
const meta = {
  title: "lists/GroupedSections",
  component: GroupSections<string>,
  decorators: [inFrame],
  args: ARGS,
} satisfies Meta<typeof GroupSections<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

// Every group is a section of one list with a heading and its count; the chips jump and no chooser hides a group.
export const Default: Story = {
  play: ({ canvasElement }) => {
    const sections = sectionsOf(canvasElement);
    if (sections.length !== GROUPS.length) throw new Error("play: a group is missing");
    const headings = sections.map((s) => s.querySelector("h2")?.textContent);
    if (headings[0] !== "Flur · 3 Pflanzen")
      throw new Error(`play: the heading says "${headings[0]}"`);
    if (canvasElement.querySelector("select, [aria-pressed]"))
      throw new Error("play: a chooser or a pressed chip hides groups");
    const chips = canvasElement.querySelectorAll('[role="group"] button');
    if (chips.length !== GROUPS.length) throw new Error("play: a chip is missing");
    return Promise.resolve();
  },
};

// A fixed set (care phases) shows every group in its order; an empty one is a quiet line that is no control.
export const FixedSet: Story = {
  args: {
    groups: [
      group("dormancy", "Ruhephase", plants("Aloe", 2)),
      group("growth", "Wachstumsphase", [], { empty: "Keine Pflanze in dieser Phase." }),
    ],
  },
  play: ({ canvasElement }) => {
    const [, growth] = sectionsOf(canvasElement);
    const line = growth?.querySelector("p");
    if (line?.textContent !== "Keine Pflanze in dieser Phase.")
      throw new Error("play: the empty phase has no quiet line");
    if (growth?.querySelector("button, a, input, select"))
      throw new Error("play: the quiet line looks like a control");
    return Promise.resolve();
  },
};

// The group of an unknown value stands last, and its label carries one plain action that sets the value.
export const UnknownLast: Story = {
  args: {
    groups: [
      GROUPS[0] as SectionGroup<string>,
      group("unplaced", "Standort unbekannt", plants("Ficus", 2), {
        action: (
          <button type="button" className="min-h-11 px-3 text-primary">
            Standort setzen
          </button>
        ),
      }),
    ],
  },
  play: ({ canvasElement }) => {
    const sections = sectionsOf(canvasElement);
    const last = sections.at(-1);
    if (last?.dataset["groupKey"] !== "unplaced")
      throw new Error("play: the unknown group is not last");
    const heading = last.querySelector("[data-group-heading]");
    if (heading?.querySelectorAll("button").length !== 1)
      throw new Error("play: the label of the unknown group has not one action");
    if (sections[0]?.querySelector("[data-group-heading] button"))
      throw new Error("play: another group has an action");
    return Promise.resolve();
  },
};
