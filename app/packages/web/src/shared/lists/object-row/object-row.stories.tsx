import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { checkFocusRings } from "@/shared/testing/focus-ring/focus-ring.play";
import { withRouter, withText200 } from "@/shared/testing/story-frame/story-frame";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { OBJECT_GROUP } from "../grouped-list/group-classes";
import { ObjectRow } from "./object-row";
import { checkMetaLine, waitForText200 } from "./object-row.play";

// Catalog of the object row (US-QS-32, SG-LIST-03): the 56 px thumbnail, the name on up to two lines, one meta line and
// one trailing element or action. Light and dark come from the theme toolbar; the rows are at 360 px, in a list. The plays of the
// meta stories measure the lines in the browser (`make sb-test`, the conformance run); jsdom checks only the parts.
const PICTURE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect width="56" height="56" fill="#6b8f5e"/><circle cx="28" cy="31" r="15" fill="#c9d9b5"/></svg>',
)}`;

const meta = {
  title: "lists/ObjectRow",
  component: ObjectRow,
  args: { title: "Clip", meta: "Efeutute · Zone 2" },
  decorators: [
    withRouter,
    (Story) => (
      <div className="w-[360px] bg-background p-4">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <li>
            <Story />
          </li>
        </ul>
      </div>
    ),
  ],
} satisfies Meta<typeof ObjectRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneLineName: Story = { args: { to: "#pflanze" } };

export const TwoLineName: Story = {
  args: {
    to: "#pflanze",
    title: "Philodendron hederaceum Brasil – Ableger am Südfenster",
    meta: "Philodendron hederaceum · Lichtzone unbekannt",
  },
};

export const WithPicture: Story = {
  args: {
    to: "#pflanze",
    src: PICTURE,
    alt: "",
    title: "Fensterblatt",
    meta: "Zone 3 · Wohnzimmer",
  },
};

export const WithTrailingBadge: Story = {
  args: {
    to: "#pflanze",
    title: "Echte Aloe – Balkon",
    meta: "Echte Aloe · Zone 1",
    trailing: <Badge variant="warning">Behandeln</Badge>,
  },
};

export const WithAction: Story = {
  args: {
    to: "#pflanze",
    title: "Bogenhanf",
    meta: "Wechsel zur Wachstumsphase am 16.03.2027",
    action: (
      <Button type="button" variant="secondary" className="shrink-0 px-3">
        Umstellen
      </Button>
    ),
  },
};

export const OpensLayer: Story = {
  args: {
    title: "Clip",
    meta: "Efeutute · Zone 2",
    onClick: () => undefined,
    haspopup: "dialog",
    expanded: false,
  },
};

// The meta line breaks between its " · " parts: each part stays on one line, the dot ends the line before the break and never
// starts one (issue 2606, d-168).
export const MetaBreaksBetweenParts: Story = {
  args: {
    to: "#pflanze",
    title: "Efeutute – Fensterbank",
    meta: "Efeutute am Fenster · Zone 3 — 1 Pflanzen · Mittel",
  },
  play: ({ canvasElement }) => checkMetaLine(canvasElement, "none"),
};

// A meta that starts with an italic scientific name (the wish row) breaks between its parts the same way.
export const MetaWithScientificName: Story = {
  args: {
    to: "#pflanze",
    title: "1. Zebra-Haworthie",
    meta: (
      <>
        <i>Haworthia fasciata</i>
        {" · Zone 3 — 1 Pflanzen · Schwierigkeit: Mittel"}
      </>
    ),
  },
  play: ({ canvasElement }) => checkMetaLine(canvasElement, "none"),
};

// A part wider than the column wraps at its own spaces, takes the whole column and does not run sideways.
export const MetaPartWiderThanColumn: Story = {
  args: {
    to: "#pflanze",
    title: "Bogenhanf",
    meta: "Wechsel zur Wachstumsphase am 16.03.2027 nach dem Umtopfen · Mittel",
  },
  play: ({ canvasElement }) => checkMetaLine(canvasElement, "some"),
};

// The same rules at 200 % text, where a column holds a few letters (WCAG 1.4.4, US-QS-12).
export const MetaPartsAt200: Story = {
  decorators: [withText200],
  args: {
    to: "#pflanze",
    title: "Efeutute",
    meta: "Zone 3 — 1 Pflanzen · Pflege fällig · Wechsel zur Wachstumsphase am 16.03.2027 nach dem Umtopfen",
  },
  play: async ({ canvasElement }) => {
    await waitForText200(canvasElement);
    checkMetaLine(canvasElement, "some");
  },
};

// The rows of a list that clips them: a scrolling list (`overflow-y-auto`) with rows that clip their own box (`overflow-hidden`, the
// group of object rows). The first row stands at the top edge of the list, the last at the bottom: the ring of the page and the
// outline of forced colors (WCAG 2.4.7, DS-37, issue 2647) must lie inside the row, or the list cuts them. The row with an action
// has a button whose ring stands outside its box, and the action has the room for it.
const ROWS = [
  { name: "Clip", meta: "Efeutute · Zone 2", to: "#clip" },
  { name: "Bogenhanf", meta: "Wechsel zur Wachstumsphase am 16.03.2027", action: "Umstellen" },
  { name: "Fensterblatt", meta: "Zone 3 · Wohnzimmer", to: "#fensterblatt" },
  { name: "Echte Aloe – Balkon", meta: "Echte Aloe · Zone 1", to: "#aloe" },
  { name: "Zebra-Haworthie", meta: "Haworthia fasciata · Zone 3", to: "#haworthie" },
  { name: "Gummibaum", meta: "Ficus elastica · Zone 2", to: "#gummibaum" },
];
type RowData = (typeof ROWS)[number];

export const FocusRingInScrollingList: Story = {
  decorators: [
    (Story) => (
      <div className="flex h-[260px] w-[360px] flex-col bg-background p-4">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <ScrollEntries
      items={ROWS}
      pageSize={10}
      fit
      label="Pflanzen"
      listClassName={OBJECT_GROUP}
      getKey={(row: RowData) => row.name}
      renderItem={(row: RowData) =>
        "action" in row ? (
          <ObjectRow
            title={row.name}
            meta={row.meta}
            to="#umstellen"
            action={
              <Button type="button" variant="secondary" className="shrink-0 px-3">
                {row.action}
              </Button>
            }
          />
        ) : (
          <ObjectRow title={row.name} meta={row.meta} to={row.to} />
        )
      }
    />
  ),
  play: ({ canvasElement }) => checkFocusRings(canvasElement),
};
