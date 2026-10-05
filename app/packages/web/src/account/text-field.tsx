import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input, type InputProps } from "@/components/ui/input";

/** One labelled text field of a form with its message (DS-47); the input attributes pass through. */
export function TextField<T extends FieldValues>(
  props: {
    control: Control<T>;
    name: FieldPath<T>;
    label: string;
    /** Receives the input, so a neighbour can move the focus to it. */
    focusRef?: React.MutableRefObject<HTMLInputElement | null> | undefined;
  } & Omit<InputProps, "name" | "value" | "onChange" | "onBlur" | "ref">,
) {
  const { control, name, label, focusRef, ...input } = props;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              {...input}
              ref={(el) => {
                field.ref(el);
                if (focusRef) focusRef.current = el;
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
