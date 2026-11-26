import type { Decorator } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { must } from "@/shared/testing/story-frame/story-play";
import { OBJECT_GROUP } from "../group-classes";
import { GroupedRow } from "../grouped-list";
import type { SectionGroup } from "./group-section/group-section";

// The parts that the stories of the grouped sections share (US-QS-15, SG-LIST-06): the groups and the frame of a screen.
export const plants = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);

export const group = (
  key: string,
  label: string,
  items: string[],
  more: Partial<SectionGroup<string>> = {},
): SectionGroup<string> => ({ key, label, items, countText: `${items.length} Pflanzen`, ...more });

export const GROUPS = [
  group("a", "Flur", plants("Efeu", 3)),
  group("b", "Küche", plants("Basilikum", 4)),
  group("c", "Wohnzimmer", plants("Monstera", 6)),
  group("d", "Standort unbekannt", plants("Ficus", 3)),
];

/** The frame of a screen: a box of fixed height that the region fills and scrolls in (DS-58). */
export const inFrame: Decorator = (Story) => (
  <MemoryRouter>
    <div className="flex h-[360px] w-full flex-col bg-background p-4">
      <Story />
    </div>
  </MemoryRouter>
);

/** The list of the stories: object rows in the group look of the plants. */
export const LIST = {
  listLabel: "Pflanzen",
  pageSize: 10,
  listClassName: OBJECT_GROUP,
  getKey: (item: string) => item,
  renderItem: (item: string) => <GroupedRow bare variant="object" title={item} />,
};

/** The arguments every story starts from. */
export const ARGS = {
  label: "Pflanzen",
  jumpLabel: "Zum Standort springen",
  groups: GROUPS,
  list: LIST,
};

export const sectionsOf = (canvas: HTMLElement) =>
  Array.from(canvas.querySelectorAll<HTMLElement>("section[data-group-key]"));

export const regionOf = (canvas: HTMLElement): HTMLElement =>
  must(canvas.querySelector<HTMLElement>("[data-scroll-region]"), "the scroll region");
