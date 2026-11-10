// The preview of the CSV import (US-BES-18): the counts, the locations that will be created, the markers the file still
// needs, every row with its state and reasons, and the one filled action. Nothing is written before "importieren".
import { useEffect, useRef } from "react";
import type { ImportPreview } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { useRowPageSize } from "@/shared/patterns/responsive/pager/row-page-size";
import { texts } from "@/shared/lib/text-rules/texts";
import { focusIt } from "@/shared/platform/routing/route-focus/view-start";
import type { ImportFlow } from "../../import-flow";
import type { RowFix } from "../../import-api";
import { FailureNote } from "../failure-note/failure-note";
import { MarkerAnswers } from "./marker-answers/marker-answers";
import { PreviewRow, rowId } from "./preview-row/preview-row";
import table from "../../import-page.de.json";

const ui = texts(table);
type Counts = ImportPreview["counts"];

/** The four counts of the file, each a plain fact (P-08, P-10). */
function Counts(props: { counts: Counts }) {
  const c = props.counts;
  const items = [
    ui("countReady", { count: c.ready }),
    ui("countFlagged", { count: c.flagged }),
    ui("countAlready", { count: c.alreadyThere }),
    ui("countSkipped", { count: c.skipped }),
  ];
  return (
    <ul className="m-0 flex flex-wrap gap-x-4 gap-y-1 p-0 text-sm font-semibold">
      {items.map((item) => (
        <li key={item} className="list-none">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** What the next step is (P-09): what keeps the one filled action from working, and what stays out of the import. */
function Hints(props: { counts: Counts; markers: number }) {
  const { counts, markers } = props;
  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      {counts.ready === 0 ? <p className="m-0">{ui("hintNothingReady")}</p> : null}
      {markers > 0 ? <p className="m-0">{ui("hintMarkers")}</p> : null}
      {counts.flagged > 0 ? (
        <p className="m-0">{ui("hintFlagged", { count: counts.flagged })}</p>
      ) : null}
    </div>
  );
}

/** "n Pflanzen importieren": the one filled action; the server takes only the ready rows (US-BES-18). */
function ImportAction(props: { view: ImportFlow; counts: Counts; markers: number }) {
  const { view, counts } = props;
  const busy = view.flow.busy;
  return (
    <div className="flex flex-col gap-3">
      <Hints counts={counts} markers={props.markers} />
      <Button
        type="button"
        pending={busy}
        disabled={counts.ready === 0 || busy}
        onClick={() => void view.confirm()}
      >
        {counts.ready === 1 ? ui("importOne") : ui("importMany", { count: counts.ready })}
      </Button>
      <div>
        <Button type="button" variant="outline" onClick={view.back}>
          {ui("changeFile")}
        </Button>
      </div>
    </div>
  );
}

/** The preview step: the answer of the server to the file and the fixes so far. */
export function PreviewStep(props: { view: ImportFlow; moved: boolean }) {
  const { view, moved } = props;
  const { flow } = view;
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = useRowPageSize();
  useEffect(() => {
    if (moved && heading.current) focusIt(heading.current);
  }, [moved]);
  const preview = flow.preview;
  // The keeper's control moves the focus to its row first, so the focus is not lost when the row changes (US-QS-10).
  const fixRow = (line: number, change: RowFix) => {
    const row = document.getElementById(rowId(line));
    if (row) focusIt(row);
    view.fix(line, change);
  };
  if (preview === null) return null;
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {ui("previewHeading")}
      </h2>
      <Counts counts={preview.counts} />
      {preview.newLocations.length > 0 ? (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
          {preview.newLocations.map((name) => (
            <li key={name}>{ui("newLocation", { name })}</li>
          ))}
        </ul>
      ) : null}
      {flow.notice ? (
        <p role="status" className="m-0 text-sm">
          {flow.notice}
        </p>
      ) : null}
      {flow.failure ? <FailureNote error={flow.failure} onRetry={view.retry} /> : null}
      <MarkerAnswers requests={preview.markers} onAnswer={view.answer} />
      <Pager
        items={preview.rows}
        pageSize={rows}
        fit
        label={ui("rowsLabel")}
        getKey={(row) => row.line}
        renderItem={(row) => <PreviewRow row={row} onFix={fixRow} />}
      />
      <ImportAction view={view} counts={preview.counts} markers={preview.markers.length} />
    </section>
  );
}
