import { type Control } from "react-hook-form";
import { MEASUREMENT_LIMITS } from "@pflanzendex/core";
import { Form, FormRoot } from "@/shared/ui/form";
import { FormBarRegion } from "@/shared/ui/form-bar.page";
import { Input } from "@/shared/ui/input";
import { DateField } from "@/shared/ui/input.date-field";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { isKeyConflict, type ApiError } from "../../../shared/data";
import { Field } from "@/shared/ui/field";
import { FormMoreFields } from "@/shared/ui/form.more-fields";
import { RefusalAlert } from "../../shared/notices/notices";
import { EtiolationSigns, MeasureBar } from "./form-parts/form-parts";
import { useMeasureForm, type FormProps } from "./measure-form.state";
import { type MeasurementFields } from "../../shared/schemas";
import { QUALITY_NAME } from "../../shared/text";

/** The id of the measure form; its bar submits it through the `form` attribute (US-WAC-01, SG-SHEET-04). */
const FORM_ID = "measure-form";

function Fields(props: {
  control: Control<MeasurementFields>;
  unit: string;
  today: string;
  etiolationSigns: string | null;
  focusRef: React.MutableRefObject<HTMLInputElement | null> | undefined;
  photo: React.ReactNode;
  /** A chosen or refused photo lives behind "Mehr Angaben" and opens it (P-10). */
  photoOpen: boolean;
  /** The form opens on the photo (US-QS-15, issue 2424): "Mehr Angaben" starts open. */
  startWithPhoto: boolean;
}) {
  return (
    <>
      <Field
        control={props.control}
        name="value"
        label={`Messwert (${props.unit}, in Schritten von 0,5)`}
      >
        {(field) => (
          <Input
            {...field}
            ref={(el) => {
              field.ref(el);
              if (props.focusRef) props.focusRef.current = el;
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="zum Beispiel 12,5"
          />
        )}
      </Field>
      <Field control={props.control} name="date" label="Datum">
        {(field) => <DateField {...field} max={props.today} />}
      </Field>
      <Field control={props.control} name="quality" label="Qualität">
        {(field) => (
          <Select {...field}>
            {Object.entries(QUALITY_NAME).map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <EtiolationSigns signs={props.etiolationSigns} />
      <FormMoreFields
        control={props.control}
        names={["note"]}
        forced={props.photoOpen}
        defaultOpen={props.startWithPhoto}
      >
        <Field control={props.control} name="note" label="Notiz (optional)">
          {(field) => <Textarea {...field} rows={2} maxLength={MEASUREMENT_LIMITS.note.max} />}
        </Field>
        {props.photo}
      </FormMoreFields>
    </>
  );
}

/** A refusal of the save; a key conflict carries its one control, "Hinweis schließen" (US-QS-03). */
function SaveRefusal({ error, onClose }: { error: ApiError; onClose: () => void }) {
  return <RefusalAlert error={error} {...(isKeyConflict(error) ? { onDismiss: onClose } : {})} />;
}

/**
 * Input of a measurement (US-WAC-01): number in steps of 0.5 cm, quality (preset healthy, US-WAC-02) with the
 * etiolation signs of the species behind "Wie erkennen?", optional note. The date is today in the profile's time zone
 * (the device's as fallback) and can be changed (back-filling); the future is blocked, an emptied date is refused by
 * the schema. The optional photo (US-WAC-05) is sent after the measurement is saved. An invalid input focuses the
 * first invalid field; a refusal of the server stays visible with the text of its code and keeps the input (P-10).
 */
export function MeasureForm(props: FormProps) {
  const { form, today, submit, refusal, close, photoField, photoOpen } = useMeasureForm(props);
  return (
    <Form {...form}>
      <FormRoot
        id={FORM_ID}
        aria-label="Messung erfassen"
        onSubmit={submit}
        className="flex max-w-xl flex-col gap-3"
      >
        {/* A page form: its bar sticks at the top below md and stands after the last field from md (US-QS-32, SG-SHEET-04). */}
        <FormBarRegion>
          <Fields
            control={form.control}
            unit={props.unit}
            today={today}
            etiolationSigns={props.signs ?? null}
            focusRef={props.focusRef}
            photo={photoField}
            photoOpen={photoOpen}
            startWithPhoto={props.startWithPhoto === true}
          />
          {refusal && <SaveRefusal error={refusal} onClose={close} />}
          <MeasureBar
            formId={FORM_ID}
            saving={form.formState.isSubmitting}
            photoStatus={props.photoStatus ?? null}
            onCancel={props.onCancel}
          />
        </FormBarRegion>
      </FormRoot>
    </Form>
  );
}
