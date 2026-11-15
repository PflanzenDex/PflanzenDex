import type { Meta, StoryObj } from "@storybook/react-vite";
import { useForm } from "react-hook-form";
import { Form, FormRoot } from "../form";
import { Input } from "../../input/input";
import { Field } from "./field";

// Catalog of the Field marks (TE-18, SG-FORM-01): a required field says nothing, an optional one says "(optional)",
// a unit stands as a suffix inside the field. Light and dark come from the toolbar.
type Values = { diameterCm: string; heightCm: string };

function Demo({ optional = false }: { optional?: boolean }) {
  const form = useForm<Values>({ defaultValues: { diameterCm: "", heightCm: "" } });
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

export const Optional: Story = { args: { optional: true } };
export const Required: Story = { args: { optional: false } };
