import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@/shared/ui/button/button";
import { ShortcutHelpButton, ShortcutOverview } from "./shortcut-overview";

// The overview of the keyboard shortcuts (US-QS-11): opened by `?` and by the help entry; a sheet on a phone, a dialog from md.
const ROWS = [
  { id: "overview", keys: "?", label: "Tastenkürzel anzeigen" },
  { id: "search", keys: "/", label: "Suche öffnen" },
  { id: "today", keys: "h", label: "Heute öffnen" },
  { id: "collection", keys: "s", label: "Sammlung öffnen" },
  { id: "species", keys: "p", label: "Pokédex öffnen" },
  { id: "wishlist", keys: "w", label: "Wunschliste öffnen" },
];

const meta = {
  title: "shared/ShortcutOverview",
  component: ShortcutOverview,
} satisfies Meta<typeof ShortcutOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

function Open(props: { off: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Tastenkürzel öffnen
      </Button>
      <ShortcutOverview open={open} onOpenChange={setOpen} rows={ROWS} off={props.off} />
    </>
  );
}

export const Default: Story = {
  args: { open: true, onOpenChange: () => undefined, rows: ROWS, off: false },
  render: () => <Open off={false} />,
};

export const Off: Story = {
  args: { open: true, onOpenChange: () => undefined, rows: ROWS, off: true },
  render: () => <Open off />,
};

export const HelpEntry: Story = {
  args: { open: false, onOpenChange: () => undefined, rows: ROWS, off: false },
  render: () => <ShortcutHelpButton />,
};
