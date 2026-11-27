import * as React from "react";
import type { Control, ControllerRenderProps, FieldPath, FieldValues } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";

/** Hands the unit to the control: `suffix` is a prop of Input, which shows it inside its own box (SG-FORM-01). */
function withSuffix(control: React.ReactElement, suffix: string | undefined): React.ReactElement {
  if (suffix === undefined) return control;
  return React.cloneElement(control as React.ReactElement<{ suffix?: string }>, { suffix });
}

/**
 * One labelled field of a form with its message (DS-47, DS-48): the render prop gets the control's props and returns the
 * control. An optional `description` sits between the control and the message.
 *
 * SG-FORM-01: `optional` adds "(optional)" after the label, and a required field says nothing. `suffix` shows a unit
 * ("cm") inside the field at its right edge, not in the label; the control must be an Input.
 */
export function Field<T extends FieldValues, N extends FieldPath<T>>(props: {
  control: Control<T>;
  name: N;
  label: string;
  optional?: boolean | undefined;
  suffix?: string | undefined;
  description?: string | undefined;
  children: (field: ControllerRenderProps<T, N>) => React.ReactElement;
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel optional={props.optional}>{props.label}</FormLabel>
          <FormControl>{withSuffix(props.children(field), props.suffix)}</FormControl>
          {props.description && <FormDescription>{props.description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
