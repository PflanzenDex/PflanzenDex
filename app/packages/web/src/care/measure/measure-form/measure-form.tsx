import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Control } from "react-hook-form";
import { localToday, MEASUREMENT_LIMITS } from "@pflanzendex/core";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/fields/form/form";
import { FormBarRegion } from "@/shared/ui/button/form-bar/form-bar.page";
import { Input } from "@/shared/ui/fields/input/input";
import { DateField } from "@/shared/ui/fields/input/native-fields/date-field/date-field";
import { Select } from "@/shared/ui/fields/select/select";
import { Textarea } from "@/shared/ui/fields/textarea/textarea";
import { currentTimeZone, type ApiError } from "../../../shared/data";
import { Field } from "@/shared/ui/fields/form/field/field";
import { photoProblem } from "../measurement-header/measurement-photo";
import { FormMoreFields } from "@/shared/ui/fields/form/more-fields/more-fields";
import { RefusalAlert } from "../../shared/notices/notices";
import { EtiolationSigns, MeasureBar, PhotoInput } from "./form-parts/form-parts";
import type { MeasurementInput } from "../../shared/api/measurements-api";
import {
  measurementDefaults,
  measurementSchema,
  toMeasurementInput,
  type MeasurementFields,
} from "../../shared/schemas";
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
      <FormMoreFields control={props.control} names={["note"]} forced={props.photoOpen}>
        <Field control={props.control} name="note" label="Notiz (optional)">
          {(field) => <Textarea {...field} rows={2} maxLength={MEASUREMENT_LIMITS.note.max} />}
        </Field>
        {props.photo}
      </FormMoreFields>
    </>
  );
}

/**
 * Input of a measurement (US-WAC-01): number in steps of 0.5 cm, quality (preset healthy, US-WAC-02) with the
 * etiolation signs of the species behind "Wie erkennen?", optional note. The date is today in the profile's time zone
 * (the device's as fallback) and can be changed (back-filling); the future is blocked, an emptied date is refused by
 * the schema. The optional photo (US-WAC-05) is sent after the measurement is saved. An invalid input focuses the
 * first invalid field; a refusal of the server stays visible with the text of its code and keeps the input (P-10).
 */
export function MeasureForm(props: {
  unit: string;
  /** Etiolation signs of the species (US-WAC-02); missing or `null` shows no disclosure. */
  signs?: string | null | undefined;
  onSend: (input: MeasurementInput, photo?: File) => Promise<ApiError | null>;
  /** Receives the value field, so the empty course can move the focus to it. */
  focusRef?: React.MutableRefObject<HTMLInputElement | null>;
  /** The status while the photo is stored (US-WAC-06); `null` shows nothing. */
  photoStatus?: string | null;
  /** "Abbrechen" of the bar: leaves the page the way Back does (US-QS-32, SG-SHEET-04). */
  onCancel: () => void;
}) {
  const today = localToday(new Date(), currentTimeZone());
  const form = useFieldForm<MeasurementFields>({
    resolver: zodResolver(measurementSchema),
    defaultValues: measurementDefaults(today),
  });
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const submit = form.handleSubmit(async (values) => {
    const found = photo ? photoProblem(photo) : null;
    setProblem(found);
    if (found) return;
    const r = await props.onSend(toMeasurementInput(values), photo ?? undefined);
    setRefusal(r);
    if (r) return;
    form.reset();
    setPhoto(null);
    setInputKey((k) => k + 1);
  });
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
            photo={<PhotoInput onPick={setPhoto} problem={problem} inputKey={inputKey} />}
            photoOpen={photo !== null || problem !== null}
          />
          {refusal && <RefusalAlert error={refusal} />}
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
