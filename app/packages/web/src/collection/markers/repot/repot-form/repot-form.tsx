import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/components/ui/fields/form/form";
import { DateField } from "@/components/ui/fields/input/native-fields/date-field/date-field";
import type { ApiError } from "../../../../kernel";
import { FormButtons, Quiet, TITLE, Warning } from "../../../specimens/cards/parts/parts";
import { useEdited, useRefusal } from "../../../specimens/model/refusal";
import { repotSchema, type RepotFields } from "../../../specimens/model/schemas";
import type { RepotTarget, useRepot } from "../../../specimens/hooks/use-repot";
import { useToday } from "../../catch-date/catch-date-field/catch-date-field";

/** The fields the server refused by name: the day of the repot (`date`), for a day in the future, before the catch date (issue 1103) or no calendar day. */
const repotFields = (error: ApiError): "date"[] =>
  error.details?.some((d) => d.field === "date") ? ["date"] : [];

/** The day of the repot: the keeper's local today preset, never later (NFR-08). */
function RepotDateField({ control, today }: { control: Control<RepotFields>; today: string }) {
  return (
    <FormField
      control={control}
      name="date"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Eingetopft am</FormLabel>
          <FormControl>
            <DateField {...field} max={today} />
          </FormControl>
          <FormDescription>
            Voreingestellt ist heute. Hast du die Pflanze früher eingetopft, trage das Datum ein;
            die Zukunft geht nicht.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Pot a cutting (US-BES-04, issue 1028): one day field preset to today, "Speichern" writes, "Abbrechen" changes nothing.
 * Only the status changes; from then on the zone of the location or species applies again.
 */
export function RepotForm(props: {
  state: Pick<ReturnType<typeof useRepot>, "send" | "setOpen"> & { open: RepotTarget };
}) {
  const { open, send, setOpen } = props.state;
  const today = useToday();
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<RepotFields>({
    resolver: zodResolver(repotSchema),
    defaultValues: { date: today },
  });
  const alertText = useRefusal(error, form.setError, repotFields);
  useEdited(
    form,
    useCallback(() => setError(null), []),
  );
  const submit = form.handleSubmit(async (values) => setError(await send(values.date)));
  return (
    <section aria-labelledby="repot-title">
      <h1 id="repot-title" className={TITLE}>
        Steckling eintopfen
      </h1>
      <p className="mb-2 text-muted-foreground">„{open.name}“</p>
      <Quiet className="mb-5">
        Nur der Status ändert sich: Aus dem Steckling wird eine Pflanze. Ab dem Datum gilt die
        Lichtzone ihres Standorts oder der Art.
      </Quiet>
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label="Steckling eintopfen"
          className="flex max-w-xl flex-col gap-4"
        >
          <RepotDateField control={form.control} today={today} />
          {alertText !== null && (
            <Warning>
              <p>{alertText}</p>
            </Warning>
          )}
          <FormButtons
            submit="Speichern"
            cancel="Abbrechen"
            pending={form.formState.isSubmitting}
            onCancel={() => setOpen(null)}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
