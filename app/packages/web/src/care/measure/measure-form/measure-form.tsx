import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control } from "react-hook-form";
import { localToday, MEASUREMENT_LIMITS, MEDIA_LIMITS } from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { Form, FormRoot } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { currentTimeZone, type ApiError } from "../../../kernel";
import { Field } from "../../shared/field/field";
import { photoProblem } from "../measurement-header/measurement-photo";
import { RefusalAlert } from "../../shared/notices/notices";
import type { MeasurementInput } from "../../shared/api/measurements-api";
import {
  measurementDefaults,
  measurementSchema,
  toMeasurementInput,
  type MeasurementFields,
} from "../../shared/schemas";
import { QUALITY_NAME } from "../../shared/text";

/**
 * "Wie erkennen?" at the quality choice (US-WAC-02): the etiolation signs of the species, collapsed so the form stays
 * short on the phone. Without signs (species not visible, P-08) nothing is shown instead of an invented text.
 */
function EtiolationSigns({ signs }: { signs: string | null }) {
  if (!signs) return null;
  return (
    <details className="text-sm">
      <summary className="flex min-h-[44px] cursor-pointer items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Wie erkennen?
      </summary>
      <p>Vergeilung-Anzeichen dieser Art: {signs}</p>
    </details>
  );
}

/** The optional photo of the measurement (US-WAC-05, US-WAC-06): a file input; it is sent after the measurement is saved. */
function PhotoInput(props: {
  onPick: (file: File | null) => void;
  problem: string | null;
  inputKey: number;
}) {
  const id = "measure-photo";
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Foto (optional)</Label>
      <Input
        key={props.inputKey}
        id={id}
        type="file"
        accept={MEDIA_LIMITS.uploadTypes.join(",")}
        aria-describedby="measure-photo-hint"
        onChange={(e) => props.onPick(e.target.files?.[0] ?? null)}
      />
      <p id="measure-photo-hint" className="text-sm text-muted-foreground">
        Das Foto bleibt privat. Ort und Kameradaten werden entfernt.
      </p>
      {props.problem && (
        <p role="alert" className="text-sm text-destructive">
          {props.problem}
        </p>
      )}
    </div>
  );
}

function Fields(props: {
  control: Control<MeasurementFields>;
  unit: string;
  today: string;
  etiolationSigns: string | null;
  focusRef: React.MutableRefObject<HTMLInputElement | null> | undefined;
  photo: React.ReactNode;
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
        {(field) => <Input {...field} type="date" max={props.today} />}
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
      <Field control={props.control} name="note" label="Notiz (optional)">
        {(field) => <Textarea {...field} rows={2} maxLength={MEASUREMENT_LIMITS.note.max} />}
      </Field>
      {props.photo}
    </>
  );
}

/**
 * Input of a measurement (US-WAC-01): number in steps of 0.5 cm, quality (preset healthy, US-WAC-02) with the
 * etiolation signs of the species behind "Wie erkennen?", optional note. The date is
 * today according to the local date of the device and can be changed (back-filling); the future is blocked. The optional
 * photo (US-WAC-05) is sent after the measurement is saved. An invalid input focuses the first invalid field; a
 * refusal of the server stays visible with the text of its code and keeps the input (P-10).
 */
export function MeasureForm(props: {
  unit: string;
  /** Etiolation signs of the species (US-WAC-02); missing or `null` shows no disclosure. */
  signs?: string | null | undefined;
  onSend: (input: MeasurementInput, photo?: File) => Promise<ApiError | null>;
  /** Receives the value field, so the empty course can move the focus to it. */
  focusRef?: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const today = localToday(new Date(), currentTimeZone());
  const form = useForm<MeasurementFields>({
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
        aria-label="Messung erfassen"
        onSubmit={submit}
        className="flex max-w-xl flex-col gap-4"
      >
        <Fields
          control={form.control}
          unit={props.unit}
          today={today}
          etiolationSigns={props.signs ?? null}
          focusRef={props.focusRef}
          photo={<PhotoInput onPick={setPhoto} problem={problem} inputKey={inputKey} />}
        />
        {refusal && <RefusalAlert error={refusal} />}
        <Button type="submit" size="touch" disabled={form.formState.isSubmitting}>
          Messung speichern
        </Button>
      </FormRoot>
    </Form>
  );
}
