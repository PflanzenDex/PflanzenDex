import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/shared/ui/button";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { AppBarSlotProvider, useAppBarSlot } from "./app-bar-slot/app-bar-slot";
import { PageHeader } from "./page-header";

// Catalog of the header of a sub-page (TE-18, DS-64): the chevron back, the one h1, at most one action.
const meta = {
  title: "shared/PageHeader",
  component: PageHeader,
  decorators: [withRouter],
  args: { title: "Tauschbörse" },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { back: { label: "Zurück zu Freunde", to: "/friends" } } };
export const WithAction: Story = {
  args: {
    back: { label: "Zurück zu Freunde", to: "/friends" },
    action: (
      <Button type="button" variant="tinted">
        Geräte
      </Button>
    ),
  },
};
export const WithoutBack: Story = {};
export const SectionHeading: Story = { args: { heading: "h2", title: "Profil" } };
export const WithSubject: Story = {
  args: {
    back: { label: "Zurück zur Sammlung", to: "/collection" },
    title: "Messen",
    subject: "Adiantum raddianum – Frauenhaarfarn, ein Name in zwei Zeilen",
  },
};

/** The top bar of the shell in miniature: below `md` the page header goes into it and claims it (US-QS-32, SG-HEAD-01). */
function TopBar(props: { children: ReactNode }) {
  const bar = useAppBarSlot();
  return (
    <>
      <header className="flex items-center gap-4 border-b border-border bg-card px-4">
        <div
          data-app-bar-slot=""
          ref={bar?.setElement}
          className="flex min-w-0 flex-1 items-center"
        />
      </header>
      {props.children}
    </>
  );
}

/** Below `md` inside the shell: the title, the way back and up to two actions sit in the bar, the subject stays inline. */
export const InTopBar: Story = {
  args: {
    back: { label: "Zurück zu Freunde", to: "/friends" },
    title: "Tauschbörse",
    actions: [
      <Button key="a" type="button">
        Zum Tausch anbieten
      </Button>,
      <Button key="b" type="button" variant="ghost">
        Mehr
      </Button>,
    ],
  },
  decorators: [
    (Story) => (
      <AppBarSlotProvider>
        <TopBar>
          <Story />
        </TopBar>
      </AppBarSlotProvider>
    ),
  ],
};
