import type { Control, ControllerRenderProps, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

/** One labelled field of a form with its message (DS-47): the render prop gets the control's props and returns the control. */
export function Field<T extends FieldValues, N extends FieldPath<T>>(props: {
  control: Control<T>;
  name: N;
  label: string;
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
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
