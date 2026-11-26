import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/shared/ui/button/button";
import { check } from "@/shared/testing/story-frame/story-play";
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
    check(sections.length === GROUPS.length, "a group is missing");
    const first = sections[0]?.querySelector("h2")?.textContent;
    check(first === "Flur · 3 Pflanzen", `the heading says "${first}"`);
    // The chips only jump: none is pressed. Where they do not fit the row the same names stand in a selection field, which
    // rests on its own name and hides nothing either.
    check(canvasElement.querySelector("[aria-pressed]") === null, "a pressed chip hides groups");
    const select = canvasElement.querySelector("select");
    const chips = canvasElement.querySelectorAll('[role="group"] button');
    check(
      select !== null ? select.value === "" : chips.length === GROUPS.length,
      "a chip is missing",
    );
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
    const line = growth?.querySelector("p")?.textContent;
    check(line === "Keine Pflanze in dieser Phase.", "the empty phase has no quiet line");
    const control = growth?.querySelector("button, a, input, select");
    check(control === null, "the quiet line looks like a control");
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
          <Button type="button" variant="plain" size="sm">
            Standort setzen
          </Button>
        ),
      }),
    ],
  },
  play: ({ canvasElement }) => {
    const sections = sectionsOf(canvasElement);
    const last = sections.at(-1);
    check(last?.dataset["groupKey"] === "unplaced", "the unknown group is not last");
    const actions = last?.querySelectorAll("[data-group-heading] button").length;
    check(actions === 1, "the label of the unknown group has not one action");
    const other = sections[0]?.querySelector("[data-group-heading] button");
    check(other === null, "another group has an action");
    return Promise.resolve();
  },
};
