import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./empty-state";

// Catalog of the EmptyState (TE-17, DS-26): empty and error, each with a next action.
const meta = { title: "shared/EmptyState", component: EmptyState } satisfies Meta<
  typeof EmptyState
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Noch keine Pflanzen",
    description: "Lege deine erste Pflanze an, dann erscheint sie hier.",
    action: { label: "Pflanze anlegen", onClick: () => undefined },
  },
};

export const Error: Story = {
  args: {
    variant: "error",
    title: "Laden fehlgeschlagen",
    description: "Die Pflanzen konnten nicht geladen werden.",
    action: { label: "Erneut versuchen", onClick: () => undefined },
  },
};

export const LinkAction: Story = {
  args: { title: "Keine Vorschläge", action: { label: "Zum Pokédex", href: "/pokedex" } },
};
