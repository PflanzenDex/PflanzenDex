import type { Meta, StoryObj } from "@storybook/react-vite";
import { checkFocusRings } from "@/shared/testing/focus-ring/focus-ring.play";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { GroupedList, GroupedRow } from "./grouped-list";

// Catalog of the flat grouped list (US-QS-32, SG-SHAPE-03): a labelled group, a footer, the row kinds (link, action,
// plain, destructive) and the current row. Light and dark come from the theme toolbar; the rows are at 360 px.
const meta = {
  title: "lists/GroupedList",
  component: GroupedList,
  args: { label: "Konto", children: null },
  decorators: [
    withRouter,
    (Story) => (
      <div className="w-[360px] bg-background p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupedList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <GroupedRow to="#einstellungen" title="Einstellungen" trailing="Lena · Europe/Berlin" />
        <GroupedRow to="#erinnerungen" title="Erinnerungen" trailing="im Posteingang" />
        <GroupedRow
          to="#erfolge"
          title="Erfolge"
          trailing={<span className="font-semibold">3</span>}
        />
      </>
    ),
  },
  // The group clips its rows (`overflow-hidden rounded-card`): the ring of a row and the outline of forced colors stay inside it
  // (issue 2647, WCAG 2.4.7).
  play: ({ canvasElement }) => checkFocusRings(canvasElement),
};

export const WithFooter: Story = {
  args: {
    label: "Daten",
    footer: "Deine Daten bleiben auf deinem Konto, bis du sie löschst.",
    children: (
      <>
        <GroupedRow to="#nutzung" title="Nutzungsdaten" />
        <GroupedRow to="#meine-daten" title="Meine Daten" />
      </>
    ),
  },
};

export const CurrentRow: Story = {
  args: {
    label: "Konto",
    children: (
      <>
        <GroupedRow to="#profil" title="Lena" meta="lena@example.test" current />
        <GroupedRow to="#einstellungen" title="Einstellungen" trailing="Europe/Berlin" />
      </>
    ),
  },
};

export const ActionRow: Story = {
  args: {
    label: "App",
    children: (
      <>
        <GroupedRow onClick={() => undefined} title="App installieren" />
        <GroupedRow
          title="App auf den Home-Bildschirm legen"
          meta="In Safari: Teilen → Zum Home-Bildschirm"
        />
      </>
    ),
  },
  play: ({ canvasElement }) => checkFocusRings(canvasElement),
};

export const DestructiveAlone: Story = {
  args: {
    label: undefined,
    children: <GroupedRow tone="destructive" onClick={() => undefined} title="Abmelden …" />,
  },
};

export const WithLeadingAndMeta: Story = {
  args: {
    label: "Zonen",
    children: (
      <>
        <GroupedRow
          to="#z1"
          title="Zone 1 · Stecklingslicht"
          meta="bis 1.500 Lux · PPFD unbekannt"
        />
        <GroupedRow to="#z2" title="Fensterbank" meta="bis 15.000 Lux · PPFD 300 µmol/m²/s" />
      </>
    ),
  },
  play: ({ canvasElement }) => checkFocusRings(canvasElement),
};
