import type { Control } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input, type InputProps } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProposalFields } from "./schemas";

type Base = {
  control: Control<ProposalFields>;
  name: keyof ProposalFields;
  label: string;
  help?: string;
  required?: boolean;
  /** Spans both columns from `md` up. */
  wide?: boolean;
};

const item = (wide?: boolean) => cn(wide && "md:col-span-2");

/** One labelled text field of the proposal form with its help and message (DS-47). */
export function TextField(props: Base & Omit<InputProps, "name" | "value" | "onChange" | "ref">) {
  const { control, name, label, help, required, wide, ...input } = props;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={item(wide)}>
          <FormLabel required={required ?? false}>{label}</FormLabel>
          <FormControl>
            <Input {...field} {...input} required={required ?? false} />
          </FormControl>
          {help ? <FormDescription>{help}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** One labelled multi-line field. */
export function AreaField(props: Base & { rows: number; maxLength?: number }) {
  const { control, name, label, help, required, wide, rows, maxLength } = props;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={item(wide)}>
          <FormLabel required={required ?? false}>{label}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              rows={rows}
              required={required ?? false}
              {...(maxLength ? { maxLength } : {})}
            />
          </FormControl>
          {help ? <FormDescription>{help}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** One labelled choice; the empty first option asks to choose and counts as "not answered". */
export function ChoiceField(props: Base & { options: [string, string][] }) {
  const { control, name, label, required, options } = props;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel required={required ?? false}>{label}</FormLabel>
          <FormControl>
            <Select {...field} required={required ?? false}>
              <option value="">Bitte wählen</option>
              {options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
