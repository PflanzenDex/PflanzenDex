import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "../../empty-state/empty-state";
import { RequestState } from "./request-state";
import { PageSkeleton } from "../page-skeleton/page-skeleton";

// Catalog of the RequestState (US-QS-07, DS-09, DS-26): pending, error, empty, ready and the offline note.
const meta = {
  title: "shared/RequestState",
  component: RequestState,
  args: {
    status: "ready",
    onRetry: () => undefined,
    skeleton: <PageSkeleton label="Liste wird geladen …" />,
    children: <p>Inhalt der Liste</p>,
  },
} satisfies Meta<typeof RequestState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = { args: { status: "pending" } };

export const Failed: Story = {
  args: { status: "error", errorText: "Der Server ist gerade nicht erreichbar." },
};

export const Empty: Story = {
  args: {
    status: "empty",
    empty: (
      <EmptyState
        title="Noch nichts da"
        description="Lege den ersten Eintrag an."
        action={{ label: "Eintrag anlegen", onClick: () => undefined }}
      />
    ),
  },
};

export const Default: Story = {};

export const Offline: Story = { args: { offline: true } };
