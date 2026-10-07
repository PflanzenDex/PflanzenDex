import type { Meta, StoryObj } from "@storybook/react-vite";
import { Banner } from "./banner";

// Catalog of the Banner variants (US-QS-07, DS-56). Light and dark come from the theme toolbar. The action and the
// close button are the interactive parts; their focus ring is the shared button ring.
const meta = {
  title: "shared/Banner",
  component: Banner,
  args: { children: "Du bist offline. Änderungen werden gesendet, sobald du wieder Netz hast." },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { variant: "info", title: "Offline" } };

export const Success: Story = {
  args: { variant: "success", title: "Gesendet", children: "Alle Änderungen sind angekommen." },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    title: "Lichtzone unbekannt",
    children: "Ohne Lichtzone kann die Pflege nicht eingeschätzt werden.",
    action: { label: "Lichtzone wählen", onClick: () => undefined },
  },
};

export const ErrorWithActionAndDismiss: Story = {
  args: {
    variant: "error",
    title: "Senden fehlgeschlagen",
    children: "Deine Änderung liegt noch auf diesem Gerät.",
    action: { label: "Erneut versuchen", onClick: () => undefined },
    onDismiss: () => undefined,
  },
};

export const LongTextNarrow: Story = {
  args: {
    variant: "warning",
    title: "Dieser Hinweis hat einen sehr langen Titel, der umbrechen muss",
    children: "Donaudampfschifffahrtsgesellschaftskapitänsmützenhersteller-Verbindungsfehler.",
    onDismiss: () => undefined,
  },
};
