import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { keepsFocusClear } from "@/shared/testing/story-frame/table-focus-play";
import { expectLargeText, keepsHeaderAndColumn } from "@/shared/testing/story-frame/table-play";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { Button } from "./button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

// Catalog of the Table parts (TE-18, DS-24). The scroll region is focusable (DS-37); the Scrolling story shows it. The two
// stories of the fixed header row and first column (US-QS-15, SG-LIST-01, issue 2420) have a play function that scrolls the
// region and measures the boxes of the cells that stay (the QG-U5 conformance run waits for it, 360 x 640 px).
const meta = { title: "ui/Table", component: Table } satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const rows = [
  ["Monstera", "Fenster", "Wohnzimmer"],
  ["Efeutute", "Regal", "Flur"],
  ["Gummibaum", "Boden", "Büro"],
];

export const Default: Story = {
  render: (args) => (
    <div className="p-4">
      <Table {...args}>
        <TableCaption>Meine Pflanzen</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Standort</TableHead>
            <TableHead>Raum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([name, spot, room]) => (
            <TableRow key={name}>
              <TableCell>{name}</TableCell>
              <TableCell>{spot}</TableCell>
              <TableCell>{room}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};

/** Narrow container: only the table scrolls sideways, the page does not. */
export const Scrolling: Story = {
  render: (args) => (
    <div className="w-64 p-4">
      <Table {...args} containerLabel="Pflanzenliste" className="min-w-[32rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Standort</TableHead>
            <TableHead>Raum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([name, spot, room]) => (
            <TableRow key={name}>
              <TableCell>{name}</TableCell>
              <TableCell>{spot}</TableCell>
              <TableCell>{room}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};

// The two kinds of header cell (`TableHead`, DS-34): the column header of the header row and the row header of the first
// column (`scope="row"`), which looks like the cells of its row; both stick while the region scrolls (US-QS-15).
export const AllVariants: Story = {
  render: (args) => (
    <div className="p-4">
      <Table {...args} containerLabel="Kopfzellen">
        <TableCaption>Eine Spaltenüberschrift und eine Zeilenüberschrift</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Standort</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([name, spot]) => (
            <TableRow key={name}>
              <TableHead scope="row">{name}</TableHead>
              <TableCell>{spot}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};

/** Sixteen rows of six columns: a table larger than its frame, in height and in width. */
const plants = Array.from({ length: 16 }, (_, index) => [
  `Pflanze ${index + 1}`,
  "Fenster",
  "Wohnzimmer",
  "hell",
  "alle 7 Tage",
  "vor 3 Tagen",
]);

/** The frame of a screen (DS-58): a column of a given height that the table fills and scrolls in; the frame itself never scrolls. */
const inFrame: Decorator = (Story) => (
  <div data-frame="" className="flex h-[360px] w-full flex-col p-4">
    <Story />
  </div>
);

/** `withControls`: the facts of the third column are buttons, the controls of the focus stories (US-QS-15, issue 2573). */
function BigTable({ withControls = false }: { withControls?: boolean }) {
  return (
    <Table containerLabel="Pflanzenliste" className="min-w-[44rem]">
      <TableCaption className="sr-only">Meine Pflanzen</TableCaption>
      <TableHeader>
        <TableRow>
          {["Name", "Standort", "Raum", "Licht", "Gießen", "Zuletzt"].map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {plants.map(([name, ...facts]) => (
          <TableRow key={name}>
            <TableHead scope="row">{name}</TableHead>
            {facts.map((fact, column) => (
              <TableCell key={column}>
                {withControls && column === 1 ? (
                  <Button variant="plain" size="sm">
                    {fact}
                  </Button>
                ) : (
                  fact
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// A table larger than its frame: the region scrolls down and sideways, the header row and the first column stay, the page
// and the frame do not move (US-QS-15, SG-LIST-01, DS-58, DS-61).
export const FixedHeaderAndColumn: Story = {
  decorators: [inFrame],
  render: () => <BigTable />,
  play: ({ canvasElement }) => keepsHeaderAndColumn(canvasElement),
};

// The same at 200 % text on a phone: the cells grow, the frame still holds and the header row and the first column stay.
export const FixedHeaderAndColumnAt200: Story = {
  decorators: [inFrame, withText200],
  render: () => <BigTable />,
  play: async ({ canvasElement }) => {
    await expectLargeText(canvasElement);
    await keepsHeaderAndColumn(canvasElement);
  },
};

// A control in a later column that has the focus while it stands under the first column and the header row: the region scrolls
// it clear of both, so the sticky cells never cover the focus (WCAG 2.4.11, US-QS-15, issue 2573). At 200 % text as well.
export const FocusClearOfFixedCells: Story = {
  decorators: [inFrame],
  render: () => <BigTable withControls />,
  play: ({ canvasElement }) => keepsFocusClear(canvasElement),
};

export const FocusClearOfFixedCellsAt200: Story = {
  decorators: [inFrame, withText200],
  render: () => <BigTable withControls />,
  play: async ({ canvasElement }) => {
    await expectLargeText(canvasElement);
    await keepsFocusClear(canvasElement);
  },
};
