// The first step of the CSV import (US-BES-18, FR-BES-26): the file, the template and what its columns mean. Nothing is
// written here; "Vorschau ansehen" asks the server for the preview.
import { useEffect, useRef } from "react";
import { Button } from "@/shared/ui/button/button";
import { Label } from "@/shared/ui/display/label/label";
import { MoreHelp } from "@/shared/ui/display/more-help/more-help";
import { FileField } from "@/shared/ui/fields/input/native-fields/file-field/file-field";
import { texts } from "@/shared/lib/text-rules/texts";
import { focusIt } from "@/shared/platform/routing/route-focus/view-start";
import { templateBlob } from "../../import-api";
import type { ImportFlow } from "../../import-flow";
import { FailureNote } from "../failure-note/failure-note";
import table from "../../import-page.de.json";

const ui = texts(table);
const FILE_ID = "import-file";

/** The template as a file: its one header line, generated in the browser (US-BES-18). */
function downloadTemplate(): void {
  const url = URL.createObjectURL(templateBlob());
  const link = document.createElement("a");
  link.href = url;
  link.download = ui("templateName");
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * What the columns of the template mean, in their order, and the limits of one file (FR-BES-26). One line shows; the rest
 * opens behind "Mehr erfahren", so the step fits one screen (US-QS-15: help text holds one line).
 */
function Columns() {
  return (
    <MoreHelp
      more={
        <div className="flex flex-col gap-2">
          <p className="m-0">{ui("columnsHead")}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            <li>{ui("columnSpecies")}</li>
            <li>{ui("columnNickname")}</li>
            <li>{ui("columnLocation")}</li>
            <li>{ui("columnPurchase")}</li>
            <li>{ui("columnNotes")}</li>
          </ul>
          <p className="m-0">{ui("limits")}</p>
        </div>
      }
    >
      {ui("columnsShort")}
    </MoreHelp>
  );
}

/** The first step: pick a file, see the template, ask for the preview (P-09: the hint says what is missing). */
export function ChooseStep(props: { view: ImportFlow; moved: boolean }) {
  const { view, moved } = props;
  const { flow } = view;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (moved && heading.current) focusIt(heading.current);
  }, [moved]);
  const picked = flow.file !== null;
  const hint = !picked ? ui("chooseNeedFile") : flow.busy ? ui("reviewing") : "";
  return (
    // No min-h-0: at a larger text size the step grows with its content and scrolls in the frame (issue 1113).
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {ui("chooseHeading")}
      </h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor={FILE_ID}>{ui("fileLabel")}</Label>
        <FileField
          id={FILE_ID}
          accept=".csv,text/csv"
          onChange={(e) => void view.choose(e.target.files?.[0])}
        />
      </div>
      <div>
        <Button type="button" variant="outline" onClick={downloadTemplate}>
          {ui("template")}
        </Button>
      </div>
      <Columns />
      {flow.fileError ? (
        <p role="alert" className="m-0 text-sm">
          {flow.fileError}
        </p>
      ) : null}
      {flow.failure ? <FailureNote error={flow.failure} onRetry={view.retry} /> : null}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          pending={flow.busy}
          disabled={!picked || flow.busy}
          aria-describedby="import-review-hint"
          onClick={view.review}
        >
          {ui("chooseReview")}
        </Button>
        <p id="import-review-hint" className="m-0 text-sm text-muted-foreground">
          {hint}
        </p>
      </div>
    </section>
  );
}
