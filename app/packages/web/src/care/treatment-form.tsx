import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type Control, type ControllerRenderProps } from "react-hook-form";
import { localToday, TREATMENT_LIMITS } from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField, FormItem, FormMessage, useFormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { currentTimeZone } from "../kernel";
import { Field } from "./field";
import {
  toTreatmentInput,
  treatmentDefaults,
  treatmentSchema,
  type TreatmentFields,
} from "./schemas";
import type { TreatableSpecimen, TreatmentInput } from "./treatments-api";

type FocusRef = React.MutableRefObject<HTMLInputElement | null> | undefined;

/** The checkboxes of the specimens as one group: the first takes the focus when none is chosen, the message names the group. */
function Choice(props: {
  specimens: readonly TreatableSpecimen[];
  field: ControllerRenderProps<TreatmentFields, "specimenIds">;
  focusRef: FocusRef;
}) {
  const { error, messageId } = useFormField();
  const { field } = props;
  const toggle = (id: string) =>
    field.onChange(
      field.value.includes(id) ? field.value.filter((x) => x !== id) : [...field.value, id],
    );
  return (
    <fieldset
      aria-describedby={error ? messageId : undefined}
      className="m-0 flex min-w-0 flex-col rounded-lg border-2 border-border px-3 pb-2 pt-1"
    >
      <legend className="px-1 font-semibold">Exemplare</legend>
      {props.specimens.map((z, i) => (
        <Checkbox
          key={z.id}
          name={field.name}
          ref={(el) => {
            if (i !== 0) return;
            field.ref(el);
            if (props.focusRef) props.focusRef.current = el;
          }}
          onBlur={field.onBlur}
          invalid={Boolean(error)}
          aria-describedby={error ? messageId : undefined}
          checked={field.value.includes(z.id)}
          onChange={() => toggle(z.id)}
        >
          {z.name}
        </Checkbox>
      ))}
      <FormMessage />
    </fieldset>
  );
}

function BasicFields(props: {
  control: Control<TreatmentFields>;
  specimens: readonly TreatableSpecimen[];
  focusRef: FocusRef;
}) {
  const { control } = props;
  return (
    <>
      <FormField
        control={control}
        name="specimenIds"
        render={({ field }) => (
          <FormItem>
            <Choice specimens={props.specimens} field={field} focusRef={props.focusRef} />
          </FormItem>
        )}
      />
      <Field control={control} name="reason" label="Grund">
        {(field) => (
          <Input
            {...field}
            autoComplete="off"
            maxLength={TREATMENT_LIMITS.reason.max}
            placeholder="zum Beispiel Wollläuse"
          />
        )}
      </Field>
      <Field control={control} name="agent" label="Mittel (optional)">
        {(field) => <Input {...field} autoComplete="off" maxLength={TREATMENT_LIMITS.agent.max} />}
      </Field>
      <Field control={control} name="date" label="Datum">
        {(field) => <Input {...field} type="date" />}
      </Field>
    </>
  );
}

function CourseFields({ control }: { control: Control<TreatmentFields> }) {
  const isCourse = useWatch({ control, name: "isCourse" });
  return (
    <>
      <FormField
        control={control}
        name="isCourse"
        render={({ field }) => (
          <FormItem>
            <Checkbox
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
            >
              Kur planen (mehrere Termine)
            </Checkbox>
          </FormItem>
        )}
      />
      {isCourse && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field control={control} name="count" label="Anzahl der Termine">
            {(field) => <Input {...field} inputMode="numeric" autoComplete="off" />}
          </Field>
          <Field control={control} name="intervalDays" label="Abstand in Tagen">
            {(field) => <Input {...field} inputMode="numeric" autoComplete="off" />}
          </Field>
        </div>
      )}
    </>
  );
}

/**
 * Form "Behandlung planen" (US-BEH-01): one or several specimens, a reason, an optional agent and the (first) date;
 * with "Kur planen" N dates at T days (default 3 at 7). The date starts at today according to the device's local date
 * (NFR-08). An invalid input focuses the first invalid field; a refusal stays visible and keeps the input (P-10).
 */
export function TreatmentForm(props: {
  specimens: readonly TreatableSpecimen[];
  running: boolean;
  onSend: (input: TreatmentInput) => Promise<boolean>;
  /** Receives the first checkbox, so the empty list of open treatments can move the focus here. */
  focusRef?: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const today = localToday(new Date(), currentTimeZone());
  const form = useForm<TreatmentFields>({
    resolver: zodResolver(treatmentSchema),
    defaultValues: treatmentDefaults(today),
  });
  const isCourse = useWatch({ control: form.control, name: "isCourse" });
  const submit = form.handleSubmit(async (values) => {
    if (await props.onSend(toTreatmentInput(values)))
      form.reset({ ...values, specimenIds: [], reason: "", agent: "" });
  });
  return (
    <Form {...form}>
      <form
        aria-label="Behandlung planen"
        noValidate
        onSubmit={(e) => void submit(e)}
        className="flex max-w-xl flex-col gap-4"
      >
        <BasicFields control={form.control} specimens={props.specimens} focusRef={props.focusRef} />
        <CourseFields control={form.control} />
        <Button type="submit" size="touch" disabled={props.running || form.formState.isSubmitting}>
          {isCourse ? "Kur planen" : "Behandlung speichern"}
        </Button>
      </form>
    </Form>
  );
}
