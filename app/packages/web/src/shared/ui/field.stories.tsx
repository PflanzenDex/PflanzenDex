import type { Meta, StoryObj } from "@storybook/react-vite";
import { check, must } from "@/shared/testing/story-frame/story-play";
import { Checkbox } from "./checkbox";
import { Form, FormRoot, useFieldForm } from "./form";
import { Input } from "./input";
import { Field } from "./field";
import { FieldLegend, FieldSet } from "./field.set";

// Catalog of the Field marks (TE-18, SG-FORM-01): a required field says nothing, an optional one says "(optional)",
// a unit stands as a suffix inside the field. FieldSet and FieldLegend name a group of checkboxes or radios (US-QS-09).
// Light and dark come from the toolbar.
type Values = { diameterCm: string; heightCm: string };

function Demo({ optional = false }: { optional?: boolean }) {
  const form = useFieldForm<Values>({ defaultValues: { diameterCm: "", heightCm: "" } });
  return (
    <Form {...form}>
      <FormRoot className="flex max-w-xs flex-col gap-4 p-4">
        <Field
          control={form.control}
          name="diameterCm"
          label="Durchmesser"
          optional={optional}
          suffix="cm"
        >
          {(field) => <Input {...field} inputMode="decimal" autoComplete="off" />}
        </Field>
        <Field control={form.control} name="heightCm" label="Höhe" suffix="cm">
          {(field) => <Input {...field} inputMode="decimal" autoComplete="off" />}
        </Field>
      </FormRoot>
    </Form>
  );
}

const meta = { title: "ui/Field", component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

// The baseline state of the catalog (QG-U5): the required field, which says nothing next to its label.
export const Default: Story = {};
export const Optional: Story = { args: { optional: true } };
export const Required: Story = { args: { optional: false } };

/** The group a play looks at: the fieldset with its legend as the first child, which names the group (US-QS-09). */
function groupOf(canvasElement: HTMLElement, name: string): HTMLFieldSetElement {
  const set = must(canvasElement.querySelector("fieldset"), "the fieldset");
  const legend = must(set.firstElementChild, "the legend");
  check(legend.tagName === "LEGEND", "the legend is the first child of the fieldset");
  check(legend.textContent === name, `the legend says "${name}"`);
  return set;
}

// A set of checkboxes with its group name (US-QS-09, WCAG 1.3.1): the screen reader reads "Pflanzen, Gruppe" before the boxes.
export const CheckboxSet: Story = {
  render: () => (
    <FieldSet className="max-w-xs p-4">
      <FieldLegend>Pflanzen</FieldLegend>
      <Checkbox defaultChecked>Aloe vera</Checkbox>
      <Checkbox>Echeveria</Checkbox>
      <Checkbox>Farn</Checkbox>
    </FieldSet>
  ),
  play: ({ canvasElement }) => {
    const set = groupOf(canvasElement, "Pflanzen");
    check(set.querySelectorAll('input[type="checkbox"]').length === 3, "the group holds 3 boxes");
  },
};

// The legend in the size of a field label (`variant="label"`, 14 px), for a group inside a form next to labelled fields.
export const LabelLegend: Story = {
  render: () => (
    <FieldSet className="max-w-xs gap-2 p-4">
      <FieldLegend variant="label">Ruhezeit</FieldLegend>
      <Checkbox>Mittags nichts senden</Checkbox>
      <Checkbox>Nachts nichts senden</Checkbox>
    </FieldSet>
  ),
  play: ({ canvasElement }) => {
    const set = groupOf(canvasElement, "Ruhezeit");
    check(set.firstElementChild?.getAttribute("data-variant") === "label", "the legend is a label");
  },
};

// Radios in a group: the legend is the question, each radio is named by its own label.
export const RadioSet: Story = {
  render: () => (
    <FieldSet className="max-w-xs p-4">
      <FieldLegend>Wie nutzt du die App?</FieldLegend>
      {["Wenige Funktionen", "Alle Funktionen"].map((text, i) => (
        <label key={text} className="flex min-h-[44px] items-center gap-3 text-base">
          <input
            type="radio"
            name="style"
            value={String(i)}
            defaultChecked={i === 0}
            className="size-5 accent-primary"
          />
          <span>{text}</span>
        </label>
      ))}
    </FieldSet>
  ),
  play: ({ canvasElement }) => {
    const set = groupOf(canvasElement, "Wie nutzt du die App?");
    check(set.querySelectorAll('input[type="radio"]').length === 2, "the group holds 2 radios");
  },
};

// A group whose name the screen reader reads and the screen does not show (`srOnly`): the title of the card names it already.
export const HiddenLegend: Story = {
  render: () => (
    <FieldSet className="max-w-xs gap-0 p-4">
      <FieldLegend srOnly>Erinnerungen aussetzen</FieldLegend>
      <Checkbox>Gießen</Checkbox>
      <Checkbox>Messungen</Checkbox>
    </FieldSet>
  ),
  play: ({ canvasElement }) => {
    const set = groupOf(canvasElement, "Erinnerungen aussetzen");
    check(set.firstElementChild?.className.includes("sr-only") === true, "the legend is hidden");
  },
};
