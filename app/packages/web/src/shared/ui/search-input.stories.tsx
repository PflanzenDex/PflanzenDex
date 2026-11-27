import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SearchInput } from "./search-input";
import { Label } from "./label";

// Catalog of the SearchInput states (TE-18): default, with text (own clear button) and disabled. Light and dark come from the toolbar.
const meta = {
  title: "ui/SearchInput",
  component: SearchInput,
  args: { value: "", onClear: () => undefined, placeholder: "Suche" },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo(props: {
  id: string;
  initial: string;
  disabled?: boolean;
  keyHint?: { visible: string; aria: string };
}) {
  const [text, setText] = useState(props.initial);
  return (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor={props.id}>Name der Pflanze</Label>
      <SearchInput
        id={props.id}
        placeholder="z. B. Monstera"
        autoComplete="off"
        value={text}
        disabled={props.disabled}
        keyHint={props.keyHint}
        onChange={(e) => setText(e.target.value)}
        onClear={() => setText("")}
      />
    </div>
  );
}

// With the key hint: the end room is reserved from md only, where the key shows, so at 360 px the placeholder has the full width (issue 2633).
export const Default: Story = {
  render: () => <Demo id="s-default" initial="" keyHint={{ visible: "/", aria: "/" }} />,
};

export const WithText: Story = { render: () => <Demo id="s-text" initial="Monstera" /> };

// Both rooms of the end of the field (QG-U5, `endRoom`): "none" while the field is empty, "end" for the clear button once it has text.
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Demo id="s-room-none" initial="" />
      <Demo id="s-room-end" initial="Monstera" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => <Demo id="s-disabled" initial="Monstera" disabled />,
};
