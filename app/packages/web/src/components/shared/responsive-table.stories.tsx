import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import { PageSkeleton } from "./page-skeleton";
import { ResponsiveTable, type ResponsiveColumn } from "./responsive-table";

// Catalog of the ResponsiveTable (TE-17, DS-24, DS-26): rows, loading, empty and error.
// Below md (viewport "phone") the rows are cards, from md (viewport "tablet") the real table.
type Row = { id: string; name: string; spot: string };

const rows: Row[] = [
  { id: "1", name: "Monstera", spot: "Fenster" },
  { id: "2", name: "Efeutute", spot: "Regal" },
  { id: "3", name: "Gummibaum", spot: "Boden im Büro" },
];

const columns: ResponsiveColumn<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
  { key: "spot", header: "Standort", cell: (r) => r.spot },
];

const meta = { title: "shared/ResponsiveTable", component: ResponsiveTable<Row> } satisfies Meta<
  typeof ResponsiveTable<Row>
>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: ComponentProps<typeof ResponsiveTable<Row>> = {
  caption: "Meine Pflanzen",
  columns,
  rows,
  getRowKey: (r) => r.id,
  rowAction: {
    label: "Aktion",
    render: (r) => (
      <Button variant="outline" size="sm" aria-label={`${r.name} öffnen`}>
        Öffnen
      </Button>
    ),
  },
};

export const Default: Story = {
  args,
  render: (args) => (
    <div className="p-4">
      <ResponsiveTable {...args} />
    </div>
  ),
};

export const Loading: Story = { args, render: () => <PageSkeleton /> };

export const Empty: Story = {
  args,
  render: () => (
    <div className="p-4">
      <EmptyState
        title="Noch keine Pflanzen"
        action={{ label: "Pflanze anlegen", onClick: () => undefined }}
      />
    </div>
  ),
};

export const Error: Story = {
  args,
  render: () => (
    <div className="p-4">
      <EmptyState
        variant="error"
        title="Laden fehlgeschlagen"
        action={{ label: "Erneut versuchen", onClick: () => undefined }}
      />
    </div>
  ),
};
