import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/shared/ui/button";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
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
      group("growth", "Wachstumsphase", [], { empty: "Zurzeit keine Pflanze." }),
    ],
  },
  play: ({ canvasElement }) => {
    const [, growth] = sectionsOf(canvasElement);
    const line = growth?.querySelector("p")?.textContent;
    check(line === "Zurzeit keine Pflanze.", "the empty phase has no quiet line");
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

/** The width of the list on a 360 px phone with the page's 32 px at each side (SG-SHAPE-07). */
const phoneRow: Decorator = (Story) => (
  <div className="w-[296px] max-w-full">
    <Story />
  </div>
);

/** What is wrong with a heading row at 200 % text on a phone: the heading squeezed, the action beside it or out of the row. */
function rowProblems(row: HTMLElement, heading: HTMLElement, action: HTMLElement): string[] {
  const [h, a, r] = [heading, action, row].map((e) => e.getBoundingClientRect());
  if (h === undefined || a === undefined || r === undefined) return [];
  const problems: string[] = [];
  // The heading keeps the width of the row: the action stands below it, at the trailing edge, and nothing leaves the row.
  if (h.width < r.width - 1)
    problems.push(
      `the heading is ${Math.round(h.width)} px wide in a row of ${Math.round(r.width)} px`,
    );
  if (a.top < h.bottom - 1) problems.push("the action does not stand below the heading");
  if (a.right > r.right + 1) problems.push("the action runs out of the row");
  if (row.scrollWidth > row.clientWidth + 1) problems.push("the heading row runs sideways");
  // Two lines are what the name needs at 296 px; a column of 24 lines is the squeezed heading.
  const lines = h.height / parseFloat(getComputedStyle(heading).lineHeight);
  if (lines > 3) problems.push(`the heading breaks into ${Math.round(lines)} lines`);
  return problems;
}

// At 200 % text the action "Standort setzen" takes most of the row. The heading keeps at least 8 rem, so the action wraps below
// it, at the trailing edge of its own line, instead of squeezing the heading into a column of a few letters (issue 2524,
// SG-TYPE-05; the same wrap as the action of an object row, issue 2322).
export const UnknownAt200: Story = {
  decorators: [phoneRow, withText200],
  args: {
    groups: [
      GROUPS[0] as SectionGroup<string>,
      group("unplaced", "Standort unbekannt", plants("Ficus", 3), {
        action: (
          <Button type="button" variant="plain" size="sm" className="shrink-0">
            Standort setzen
          </Button>
        ),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const last = must(sectionsOf(canvasElement).at(-1), "the unknown group");
    const row = must(last.querySelector<HTMLElement>("[data-group-heading]"), "its heading row");
    const heading = must(row.querySelector<HTMLElement>("h2"), "its heading");
    const action = must(row.querySelector<HTMLElement>("button"), "its action");
    if (!hasLayout(row)) return;
    const size = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
    await waitUntil(() => size() >= 31, "the text is 200 %");
    const problems = rowProblems(row, heading, action);
    check(problems.length === 0, problems.join("; "));
  },
};
