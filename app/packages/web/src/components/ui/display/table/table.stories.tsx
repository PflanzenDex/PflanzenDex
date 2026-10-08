import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

// Catalog of the Table parts (TE-18, DS-24). The scroll region is focusable (DS-37); the Scrolling story shows it.
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
