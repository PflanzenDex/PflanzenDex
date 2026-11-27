import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { localToday } from "@pflanzendex/core";
import { useFieldForm } from "@/shared/ui/form";
import { currentTimeZone, type ApiError } from "../../../shared/data";
import { photoProblem } from "../measurement-header/measurement-photo";
import { PhotoInput } from "./form-parts/form-parts";
import type { MeasurementInput } from "../../shared/api/measurements-api";
import {
  measurementDefaults,
  measurementSchema,
  toMeasurementInput,
  type MeasurementFields,
} from "../../shared/schemas";

/**
 * The refusal of the last save and its close. A key conflict closes with its one control, and that frees the key of the save
 * (`release`, US-QS-03); other refusals stay until the keeper acts (P-10).
 */
function useSaveRefusal(release?: () => void) {
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const close = () => {
    setRefusal(null);
    release?.();
  };
  return { refusal, setRefusal, close };
}

export type FormProps = {
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
  /** Frees the key of the save when the keeper dismisses a key conflict (US-QS-03). */
  onDismissRefusal?: () => void;
  /** The keeper chose "Foto" in the plant layer (US-QS-15, issue 2424): the photo field opens and its picker starts once. */
  startWithPhoto?: boolean;
  /** The picker was started: the caller drops the request, so a later render does not start it again. */
  onPhotoStarted?: () => void;
};

/** The state of the form: its fields, the optional photo with its refusal, the send and the refusal of the server (P-10). */
export function useMeasureForm(props: FormProps) {
  const today = localToday(new Date(), currentTimeZone());
  const form = useFieldForm<MeasurementFields>({
    resolver: zodResolver(measurementSchema),
    defaultValues: measurementDefaults(today),
  });
  const { refusal, setRefusal, close } = useSaveRefusal(props.onDismissRefusal);
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
  const photoField = (
    <PhotoInput
      onPick={setPhoto}
      problem={problem}
      inputKey={inputKey}
      start={props.startWithPhoto === true}
      {...(props.onPhotoStarted ? { onStarted: props.onPhotoStarted } : {})}
    />
  );
  const photoOpen = photo !== null || problem !== null;
  return { form, today, submit, refusal, close, photoField, photoOpen };
}
