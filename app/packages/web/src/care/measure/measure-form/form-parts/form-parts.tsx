import { MEDIA_LIMITS } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { FormBar } from "@/shared/ui/button/form-bar/form-bar";
import { FileField } from "@/shared/ui/fields/input/native-fields/file-field/file-field";
import { Label } from "@/shared/ui/display/label/label";
import { DisclosureSummary } from "@/shared/ui/display/more-help/disclosure-summary/disclosure-summary";
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

/** The optional photo of the measurement (US-WAC-05, US-WAC-06): a file input; it is sent after the measurement is saved. */
export function PhotoInput(props: {
  onPick: (file: File | null) => void;
  problem: string | null;
  inputKey: number;
}) {
  const id = "measure-photo";
  const labelId = `${id}-label`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={labelId} htmlFor={id}>
        {t("photo.label")}
      </Label>
      <FileField
        key={props.inputKey}
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
 * stored follows it in the DOM, always there so a status that appears is announced, and empty it takes no room (US-WAC-06).
 */
export function MeasureBar(props: {
  formId: string;
  saving: boolean;
  photoStatus: string | null;
  onCancel: () => void;
}) {
  return (
    <>
      <FormBar formId={props.formId} disabled={props.saving} needsNetwork onCancel={props.onCancel}>
        {t("save")}
      </FormBar>
      <p role="status" className="text-sm text-muted-foreground empty:hidden">
        {props.photoStatus}
      </p>
    </>
  );
}
