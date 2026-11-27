import type { Meta, StoryObj } from "@storybook/react-vite";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ObjectRow } from "./object-row";

// Catalog of the object row (US-QS-32, SG-LIST-03): the 56 px thumbnail, the name on up to two lines, one meta line and
// one trailing element or action. Light and dark come from the theme toolbar; the rows are at 360 px, in a list.
const PICTURE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect width="56" height="56" fill="#6b8f5e"/><circle cx="28" cy="31" r="15" fill="#c9d9b5"/></svg>',
)}`;

const meta = {
  title: "lists/ObjectRow",
  component: ObjectRow,
  args: { title: "Clip", meta: "Efeutute · Zone 2" },
  decorators: [
    withRouter,
    (Story) => (
      <div className="w-[360px] bg-background p-4">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <li>
            <Story />
          </li>
        </ul>
      </div>
    ),
  ],
} satisfies Meta<typeof ObjectRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneLineName: Story = { args: { to: "#pflanze" } };

export const TwoLineName: Story = {
  args: {
    to: "#pflanze",
    title: "Philodendron hederaceum Brasil – Ableger am Südfenster",
    meta: "Philodendron hederaceum · Lichtzone unbekannt",
  },
};

export const WithPicture: Story = {
  args: {
    to: "#pflanze",
    src: PICTURE,
    alt: "",
    title: "Fensterblatt",
    meta: "Zone 3 · Wohnzimmer",
  },
};

export const WithTrailingBadge: Story = {
  args: {
    to: "#pflanze",
    title: "Echte Aloe – Balkon",
    meta: "Echte Aloe · Zone 1",
    trailing: <Badge variant="warning">Behandeln</Badge>,
  },
};

export const WithAction: Story = {
  args: {
    to: "#pflanze",
    title: "Bogenhanf",
    meta: "Wechsel zur Wachstumsphase am 16.03.2027",
    action: (
      <Button type="button" variant="secondary" className="shrink-0 px-3">
        Umstellen
      </Button>
    ),
  },
};

export const OpensLayer: Story = {
  args: {
    title: "Clip",
    meta: "Efeutute · Zone 2",
    onClick: () => undefined,
    haspopup: "dialog",
    expanded: false,
  },
};
