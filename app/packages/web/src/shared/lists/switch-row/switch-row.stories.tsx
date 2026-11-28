import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { checkFocusRings } from "@/shared/testing/focus-ring/focus-ring.play";
import { GroupedList } from "../grouped-list/grouped-list";
import { ObjectPlaceholder } from "../object-placeholder/object-placeholder";
import { SwitchRow } from "./switch-row";

// Catalog of the switch row (US-QS-32, SG-CTRL-02, SG-CTRL-05): the label at the leading edge, one secondary line, the switch at the
// trailing edge, in a flat group at 360 px. Light and dark come from the theme toolbar. The rows keep the 44 px height at 200 %
// text, where the label and the line wrap and the switch keeps its size.
const meta = {
  title: "lists/SwitchRow",
  component: SwitchRow,
  args: {
    label: "Empfehlungen zeigen",
    help: "Nur du siehst sie.",
    checked: false,
    onCheckedChange: () => undefined,
  },
  render: (args) => {
    const [on, setOn] = useState(args.checked);
    return (
      <GroupedList label="Datenschutz und Empfehlungen" level={3}>
        <SwitchRow {...args} checked={on} onCheckedChange={setOn} />
        <SwitchRow
          label="Alles privat"
          help="Setzt alle Freigaben aus, ohne sie zu löschen."
          checked
          onCheckedChange={() => undefined}
        />
      </GroupedList>
    );
  },
  decorators: [
    (Story) => (
      <div className="w-[360px] bg-background p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SwitchRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  // The group clips its rows: the ring of the switch stays inside it (issue 2647, WCAG 2.4.7).
  play: ({ canvasElement }) => checkFocusRings(canvasElement),
};

export const On: Story = { args: { checked: true } };

export const LongLabel: Story = {
  args: {
    label: "Meine Sammlung in die Seltenheit in PflanzenDéx einrechnen",
    help: "Es fließt nur eine Zahl pro Art ein, nie wer eine Art besitzt.",
  },
};

export const WithoutHelp: Story = { args: { help: undefined } };

export const WithError: Story = {
  args: { error: "Das hat nicht geklappt. Die Einstellung ist noch wie vorher." },
};

export const Busy: Story = { args: { busy: true } };

export const WithThumbnail: Story = {
  args: {
    label: "Clip mit Freunden teilen",
    help: undefined,
    leading: (
      <span className="flex size-[56px] items-center justify-center overflow-hidden rounded-lg">
        <ObjectPlaceholder />
      </span>
    ),
  },
};

export const At200Text: Story = {
  decorators: [withText200],
  args: {
    label: "Meine Sammlung in die Seltenheit in PflanzenDéx einrechnen",
    help: "Es fließt nur eine Zahl pro Art ein, nie wer eine Art besitzt.",
  },
};
