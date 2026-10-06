import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button";
import { Sheet, SheetContent, SheetTrigger } from "./sheet";

// Catalog of the Sheet states (TE-18): closed and open.
const meta = { title: "ui/Sheet", component: Sheet } satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Öffnen</Button>
      </SheetTrigger>
      <SheetContent title="Filter">
        <Button>Anwenden</Button>
      </SheetContent>
    </Sheet>
  ),
};

export const Open: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetContent title="Filter">
        <Button>Anwenden</Button>
      </SheetContent>
    </Sheet>
  ),
};
