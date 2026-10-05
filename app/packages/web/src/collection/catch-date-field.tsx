import type { Control } from "react-hook-form";
import { localToday } from "@pflanzendex/core";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { currentTimeZone, type ApiError } from "../kernel";
import type { CreateFields } from "./schemas";

/** True when the server refused the catch date itself (field `catchDate`). */
export const refusesCatchDate = (error: ApiError | null): boolean =>
  error?.details?.some((d) => d.field === "catchDate") ?? false;

/** The keeper's local today (profile time zone, NFR-08), the preset and upper limit of the field. */
export const useToday = (): string => localToday(new Date(), currentTimeZone());

/**
 * The catch date of the new specimen (FR-BES-04): preset to the keeper's local today, never later than today. An
 * earlier date is allowed for a plant the keeper already owned. A refusal marks the field (`aria-invalid`), points
 * at the error text (`aria-describedby`) and takes the focus (see `useRefusal`).
 */
export function CatchDateField(props: { control: Control<CreateFields>; today: string }) {
  return (
    <FormField
      control={props.control}
      name="catchDate"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Fangdatum</FormLabel>
          <FormControl>
            <Input {...field} type="date" max={props.today} />
          </FormControl>
          <FormDescription>
            Voreingestellt ist heute. Hast du die Pflanze schon länger, trage hier ein früheres
            Datum ein; ein Datum in der Zukunft geht nicht.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
