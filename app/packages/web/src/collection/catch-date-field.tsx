import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control } from "react-hook-form";
import { localToday } from "@pflanzendex/core";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { currentTimeZone, type ApiError } from "../kernel";
import { FormButtons, Quiet, TITLE, Warning } from "./parts";
import { useEdited, useRefusal } from "./refusal";
import { catchDateSchema, type CatchDateFields, type CreateFields } from "./schemas";
import { correctCatchDate } from "./specimens-api";
import { UNKNOWN, dateText } from "./text";
import { SIGN_IN, type Token } from "./use-collection";

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

/** The specimen whose catch date is being corrected (US-BES-11). */
export type CatchDateTarget = { id: string; name: string; caughtAt: string | null };

/**
 * State and action for correcting the catch date (US-BES-11). After success the page reloads (`after`) and the message
 * names the specimen and the new date (P-09); a refusal stays in the form (P-10).
 */
export function useCatchDate(api: string, token: Token, after: () => void) {
  const [open, setOpen] = useState<CatchDateTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const send = useCallback(
    async (catchDate: string): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !open) return SIGN_IN;
      const r = await correctCatchDate(api, t, { id: open.id, catchDate });
      if (!r.ok) return r.error;
      const date = r.value.caughtAt ? dateText(r.value.caughtAt) : UNKNOWN;
      setMessage(
        `Das Fangdatum von „${open.name}“ ist jetzt der ${date}. Der Pokédex rechnet damit.`,
      );
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after],
  );

  return { open, message, send, setOpen, setMessage };
}

const catchDateFields = (error: ApiError): "catchDate"[] =>
  refusesCatchDate(error) ? ["catchDate"] : [];

/** The date field of the correction (US-BES-11): a calendar date, at most the keeper's local today. */
function CorrectedDateField(props: { control: Control<CatchDateFields>; today: string }) {
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
          <FormDescription>Heute oder ein früheres Datum; die Zukunft geht nicht.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Correct the catch date of an existing specimen (US-BES-11): preset to the stored date (or today if it is unknown),
 * never later than the keeper's local today. Only the catch date changes; the Pokédex derives its date from it.
 */
export function CatchDateForm(props: {
  state: Pick<ReturnType<typeof useCatchDate>, "send" | "setOpen"> & { open: CatchDateTarget };
}) {
  const { open, send, setOpen } = props.state;
  const today = useToday();
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<CatchDateFields>({
    resolver: zodResolver(catchDateSchema),
    defaultValues: { catchDate: open.caughtAt ?? today },
  });
  const alertText = useRefusal(error, form.setError, catchDateFields);
  useEdited(
    form,
    useCallback(() => setError(null), []),
  );
  const submit = form.handleSubmit(async (values) => setError(await send(values.catchDate)));
  return (
    <section aria-labelledby="catch-date-title">
      <h1 id="catch-date-title" className={TITLE}>
        Fangdatum korrigieren
      </h1>
      <p className="mb-2 text-muted-foreground">„{open.name}“</p>
      <Quiet className="mb-5">
        Bisher: {open.caughtAt ? dateText(open.caughtAt) : UNKNOWN}. Nur das Fangdatum ändert sich;
        der Pokédex rechnet mit dem neuen Datum.
      </Quiet>
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label="Fangdatum korrigieren"
          className="flex max-w-xl flex-col gap-4"
        >
          <CorrectedDateField control={form.control} today={today} />
          {alertText !== null && (
            <Warning>
              <p>{alertText}</p>
            </Warning>
          )}
          <FormButtons
            submit="Fangdatum speichern"
            cancel="Abbrechen"
            pending={form.formState.isSubmitting}
            onCancel={() => setOpen(null)}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
