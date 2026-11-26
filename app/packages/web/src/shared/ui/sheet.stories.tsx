import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Sheet, SheetContent, SheetLoading, SheetTrigger } from "./sheet";

// Catalog of the Sheet states (TE-18): closed, open and loading.
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

// The state while the chunk of the sheet is on its way (NFR-12, QG-U5): the centred status panel.
export const Loading: Story = { render: () => <SheetLoading /> };

// A content that is longer than half the visible window: the sheet opens at half height with a handle and a toggle, and the
// content scrolls inside it under the fixed title (US-QS-15). The one picture of the heights (P-V).
export const HalfHeight: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetContent title="Pflegehinweise">
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 30 }, (_, index) => (
            <li key={index}>Hinweis {index + 1} zur Pflege dieser Pflanze.</li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  ),
};
