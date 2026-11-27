import { useEffect, useRef } from "react";
import { MEDIA_LIMITS } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { FormBar } from "@/shared/ui/form-bar";
import { FileField } from "@/shared/ui/input.file-field";
import { Label } from "@/shared/ui/label";
import { DisclosureSummary } from "@/shared/ui/more-help.disclosure-summary";
import table from "./form-parts.de.json";

const t = texts(table);

/**
 * "Wie erkennen?" at the quality choice (US-WAC-02): the etiolation signs of the species, collapsed so the form stays
 * short on the phone. Without signs (species not visible, P-08) nothing is shown instead of an invented text.
 */
export function EtiolationSigns({ signs }: { signs: string | null }) {
  if (!signs) return null;
  return (
    <details className="text-sm">
      <DisclosureSummary className="rounded-md">{t("signs.summary")}</DisclosureSummary>
      <p>{t("signs.text", { signs })}</p>
    </details>
  );
}

/**
 * The optional photo of the measurement (US-WAC-05, US-WAC-06): a file input; it is sent after the measurement is saved. With
 * `start` (the keeper chose "Foto" in the plant layer, US-QS-15, issue 2424) the field takes the focus and its picker is started once
 * when the form shows, and `onStarted` says so. A browser may refuse a picker that no tap has asked for (a reload, a phone
 * that wants the tap in the same call); then the field is open and focused, one tap from the picker.
 */
export function PhotoInput(props: {
  onPick: (file: File | null) => void;
  problem: string | null;
  inputKey: number;
  start?: boolean;
  onStarted?: () => void;
}) {
  const id = "measure-photo";
  const labelId = `${id}-label`;
  const input = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const { start, onStarted } = props;
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;
    input.current?.focus();
    input.current?.click();
    onStarted?.();
  }, [start, onStarted]);
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={labelId} htmlFor={id}>
        {t("photo.label")}
      </Label>
      <FileField
        key={props.inputKey}
        ref={input}
        id={id}
        groupLabelledBy={labelId}
        accept={MEDIA_LIMITS.uploadTypes.join(",")}
        aria-describedby="measure-photo-hint"
        onChange={(e) => props.onPick(e.target.files?.[0] ?? null)}
      />
      <p id="measure-photo-hint" className="text-sm text-muted-foreground">
        {t("photo.hint")}
      </p>
      {props.problem && (
        <p role="alert" className="text-sm text-destructive">
          {props.problem}
        </p>
      )}
    </div>
  );
}

/**
 * The bar of the measure form (US-QS-32, SG-SHEET-04), last in the form: "Abbrechen" and "Messung sichern", at the top of
 * the form below md, sticky and above the keyboard (SG-FORM-02), after the last field from md. The status while the photo is
 * stored is the bar's status line: it stands right under the bar in both places, always in the DOM so a status that appears
 * is announced, and empty it takes no room (US-WAC-06).
 */
export function MeasureBar(props: {
  formId: string;
  saving: boolean;
  photoStatus: string | null;
  onCancel: () => void;
}) {
  return (
    <FormBar
      formId={props.formId}
      disabled={props.saving}
      needsNetwork
      onCancel={props.onCancel}
      status={props.photoStatus}
    >
      {t("save")}
    </FormBar>
  );
}
