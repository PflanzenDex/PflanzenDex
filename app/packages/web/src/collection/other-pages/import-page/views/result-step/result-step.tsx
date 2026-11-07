// The result of the CSV import (US-BES-18, P-10): what was created, what was skipped and what was refused with the reason
// of each refusal, the locations that still lack a light zone, and the next steps.
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { ConfirmResult } from "@pflanzendex/core";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { PATHS, todayAddress } from "@/shared/patterns/navigation/navigation/navigation";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { useRowPageSize } from "@/shared/patterns/responsive/pager/row-page-size";
import { Button, buttonVariants } from "@/shared/ui/button/button";
import { focusIt } from "@/shared/platform/routing/route-focus/view-start";
import type { ImportFlow } from "../../import-flow";
import table from "../../import-page.de.json";

const ui = texts(table);

/** One line of the result per row the import touched, in file order (P-10: nothing disappears silently). */
interface Outcome {
  readonly line: number;
  readonly key: string;
  readonly text: string;
}

function outcomesOf(result: ConfirmResult): Outcome[] {
  const created = result.created.map((c) => ({
    line: c.line,
    key: `created-${c.line}`,
    text: ui("createdRow", { line: c.line, name: c.name }),
  }));
  const skipped = result.skipped.map((s) => ({
    line: s.line,
    key: `skipped-${s.line}`,
    text: ui("skippedRow", { line: s.line }),
  }));
  const refused = result.refused.map((r) => ({
    line: r.line,
    key: `refused-${r.line}`,
    text: ui("refusedRow", { line: r.line, reason: errorText(r.code) }),
  }));
  return [...created, ...skipped, ...refused].sort((a, b) => a.line - b.line);
}

/** The result step: what the import did, and where to go next (P-09). */
export function ResultStep(props: { view: ImportFlow; moved: boolean }) {
  const { view, moved } = props;
  const result = view.flow.result;
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = useRowPageSize();
  useEffect(() => {
    if (moved && heading.current) focusIt(heading.current);
  }, [moved]);
  if (result === null) return null;
  const counts = {
    created: result.created.length,
    skipped: result.skipped.length,
    refused: result.refused.length,
  };
  const outcomes = outcomesOf(result);
  return (
    // No min-h-0: the step grows with its content and the list pages inside the frame (issue 1113).
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {ui("resultHeading")}
      </h2>
      <p className="m-0 text-sm font-semibold">{ui("resultCounts", counts)}</p>
      {counts.created === 0 ? <p className="m-0 text-sm">{ui("resultNone")}</p> : null}
      {result.locationsCreated.length > 0 ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="m-0">{ui("locations", { names: result.locationsCreated.join(", ") })}</p>
          <p className="m-0">
            <Link to={todayAddress("hints")} className="underline">
              {ui("locationsHint")}
            </Link>
          </p>
        </div>
      ) : null}
      {result.unusedMarkers.length > 0 ? (
        <p className="m-0 text-sm">{ui("markersUnused", { count: result.unusedMarkers.length })}</p>
      ) : null}
      {outcomes.length > 0 ? (
        <Pager
          items={outcomes}
          pageSize={rows}
          fit
          label={ui("resultList")}
          getKey={(o) => o.key}
          renderItem={(o) => <p className="m-0 text-sm">{o.text}</p>}
        />
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to={PATHS.collection} className={buttonVariants()}>
          {ui("toCollection")}
        </Link>
        <Button type="button" variant="outline" onClick={view.again}>
          {ui("importAnother")}
        </Button>
      </div>
    </section>
  );
}
