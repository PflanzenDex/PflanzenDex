import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SearchInput } from "./search-input";
import { Label } from "../../../display/label/label";

// Catalog of the SearchInput states (TE-18): default, with text (own clear button) and disabled. Light and dark come from the toolbar.
const meta = {
  title: "ui/SearchInput",
  component: SearchInput,
  args: { value: "", onClear: () => undefined, placeholder: "Suche" },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo(props: { id: string; initial: string; disabled?: boolean }) {
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
        onChange={(e) => setText(e.target.value)}
        onClear={() => setText("")}
      />
    </div>
  );
}

export const Default: Story = { render: () => <Demo id="s-default" initial="" /> };

export const WithText: Story = { render: () => <Demo id="s-text" initial="Monstera" /> };

export const Disabled: Story = {
  render: () => <Demo id="s-disabled" initial="Monstera" disabled />,
};
