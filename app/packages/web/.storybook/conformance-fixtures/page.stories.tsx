import type { Meta, StoryObj } from "@storybook/react-vite";

// Fixture for the QG-U5 / FR-QG-27 page snapshot self-test (never part of the catalog): a page-like layout whose
// columns and text depend on the viewport width, with the same padding arg as the ui fixture.
const meta = {
  title: "ds-snapshot-fixture/Page",
  component: ({ padding }: { padding: number }) => (
    <main className="m-4 grid gap-4 md:grid-cols-3">
      {["Heute", "Sammlung", "Freunde"].map((name) => (
        <section key={name} className="border bg-muted" style={{ padding }}>
          <h2 className="text-lg">{name}</h2>
          <p>Das Layout dieser Karte folgt der Breite des Fensters.</p>
        </section>
      ))}
    </main>
  ),
  args: { padding: 12 },
  argTypes: { padding: { control: "number" } },
} satisfies Meta<{ padding: number }>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
