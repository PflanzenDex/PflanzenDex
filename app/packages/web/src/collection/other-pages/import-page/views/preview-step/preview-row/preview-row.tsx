// One row of the preview (US-BES-18): the specimen it would get, its state, the reasons as German text by their code
// (FR-QG-11, P-10) and the fixes it offers. A row that is already there offers no fix: it is skipped on import.
import type { PreviewRow as Row, RowState } from "@pflanzendex/core";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import type { RowFix } from "../../../import-api";
import { RowFixControls } from "./row-fix/row-fix";
import table from "../../../import-page.de.json";

const ui = texts(table);
const STATE_TEXT = {
  ready: "stateReady",
  flagged: "stateFlagged",
  already_there: "stateAlready",
  skipped: "stateSkipped",
} as const satisfies Record<RowState, keyof typeof table>;

/** The id of a row: the focus goes there when the keeper fixes it (route focus, US-QS-10). */
export const rowId = (line: number): string => `import-row-${line}`;

export function PreviewRow(props: { row: Row; onFix: (line: number, change: RowFix) => void }) {
  const { row } = props;
  const reasons = row.state === "flagged" ? row.reasons : [];
  return (
    <div
      id={rowId(row.line)}
      tabIndex={-1}
      className="flex min-w-0 flex-col gap-2 border-b border-border py-3"
    >
      <p className="m-0 text-sm text-muted-foreground">{ui("lineLabel", { line: row.line })}</p>
      <p className="m-0 font-medium break-words">{row.specimenName ?? row.species.name}</p>
      <p className="m-0 text-sm font-semibold">{ui(STATE_TEXT[row.state])}</p>
      {reasons.map((reason, i) => (
        <p key={`${reason.code}-${i}`} className="m-0 text-sm">
          {errorText(reason.code)}
        </p>
      ))}
      {row.state === "already_there" ? null : <RowFixControls row={row} onFix={props.onFix} />}
    </div>
  );
}
