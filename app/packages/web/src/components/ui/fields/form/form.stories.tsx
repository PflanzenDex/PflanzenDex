import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { applyServerError } from "@/lib/error-text";
import { Button } from "../../button/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "./form";
import { Input } from "../input/input";

// Catalog of the Form family (TE-18): default, invalid (empty submit), server error by code, pending submit.
const schema = z.object({ name: z.string().min(1, "Bitte einen Namen eingeben.") });
type Values = z.infer<typeof schema>;

type DemoProps = { submitEmpty?: boolean; serverError?: boolean; pending?: boolean };

function Demo({ submitEmpty, serverError, pending }: DemoProps) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: serverError ? "Monstera" : "" },
  });
  // Triggered once on mount so the story shows the state without a click.
  const shown = React.useRef(false);
  if (!shown.current) {
    shown.current = true;
    queueMicrotask(() => {
      if (submitEmpty) void form.trigger();
      if (serverError)
        applyServerError(
          { code: "input.invalid", details: [{ field: "name", code: "access.denied" }] },
          (n, e) => form.setError(n as "name", e),
        );
    });
  }
  return (
    <Form {...form}>
      <FormRoot
        className="flex flex-col gap-4 p-4"
        onSubmit={form.handleSubmit(() => new Promise<void>(() => {}))}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Name</FormLabel>
              <FormControl>
                <Input {...field} required />
              </FormControl>
              <FormDescription>Wie heißt die Pflanze?</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormMessage name="root.server" />
        {/* DS-50 pattern: while the write runs (formState.isSubmitting) the button is disabled and says so; one tap sends one write. */}
        <Button type="submit" disabled={pending || form.formState.isSubmitting}>
          {pending || form.formState.isSubmitting ? "Speichert …" : "Speichern"}
        </Button>
      </FormRoot>
    </Form>
  );
}

const meta = { title: "ui/Form", component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Invalid: Story = { args: { submitEmpty: true } };
export const ServerError: Story = { args: { serverError: true } };
export const Pending: Story = { args: { pending: true } };

// Every look of the cva tones in form.tsx: invalid true/false for the label (formTone) and the message (formMessageTone).
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-sm">invalid: false</p>
      <Demo />
      <p className="text-sm">invalid: true</p>
      <Demo submitEmpty />
    </div>
  ),
};
