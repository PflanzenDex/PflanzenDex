import type { Control, ControllerRenderProps, FieldPath, FieldValues } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/fields/form/form";

/**
 * One labelled field of a form with its message (DS-47, DS-48): the render prop gets the control's props and returns the
 * control. An optional `description` sits between the control and the message.
 */
export function Field<T extends FieldValues, N extends FieldPath<T>>(props: {
  control: Control<T>;
  name: N;
  label: string;
  description?: string | undefined;
  children: (field: ControllerRenderProps<T, N>) => React.ReactElement;
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>{props.children(field)}</FormControl>
          {props.description && <FormDescription>{props.description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
